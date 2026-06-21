"""Citability guard (TASK-057 / DEC-56 / FGAP-047).

A grounding catalogue section that a spec STRUCTURALLY checks (via
`planner.specs._check_in_catalogue` and the responsibilities-only nested
helpers) has exactly ONE admissible identity field-path — the field the
parser verifies a value against. The LLM cites a row of such a section by
copying that identity. If the snippet renders ANY OTHER field of that
section in a CITABLE (non-parenthetical) position, the model is invited to
copy a value the parser will reject — a structural foot-gun (the class
DEC-56 closes). Parenthetical `(...)` context is safe (it reads as a gloss,
not a value-to-copy); an em-dash / colon continuation is not.

Mechanism (sentinel render-probe, NOT template parsing):

  For each of the 14 specs build the live grounding (the spec's
  `grounding_sections`), then DEEP-REPLACE every catalogue LEAF with a
  path-encoding sentinel string:

      grounding["divisions"][0]["label"]        -> "SENTINEL__divisions__label"
      grounding["divisions"][0]["scope_summary"]-> "SENTINEL__divisions__scope_summary"
      grounding["division_responsibility_atoms"][0]["positions"][0]["label"]
        -> "SENTINEL__division_responsibility_atoms__positions__label"

  (List indices are collapsed; the sentinel encodes section + dotted
  field-path. Several rows therefore carry identical sentinels — that is
  fine, we only care WHICH paths surface citably, not how many rows.)

  Render the assembled spec body against that sentinel grounding. Scan the
  rendered text line by line; each surfaced `SENTINEL__<section>__<path>`
  whose occurrence is NOT inside a `(...)` group on its line is a
  field-path rendered in a citable position.

  Restrict to the sections the spec STRUCTURALLY checks + their admissible
  identity field-path(s). That checked-section -> admissible-path map is
  DERIVED from `planner.specs` by AST/dataflow (not re-encoded here, and not
  a text-match over the member-PRODUCTION call). The derivation is grounded
  in the member-CONSUMPTION sites — every

      _check_in_catalogue(value, members=<expr>, spec=<code>, field=<f>)

  raise-site reachable from the parse function — because a `_catalogue_members`
  result that is never consumed by a `_check_in_catalogue` checks nothing, and
  a member can reach a raise-site through a variable, a sub-validator
  parameter, or a nested-helper return that a literal text-match never sees.
  For each raise-site we resolve `<expr>` back to its member source:

    * a local bound to a `_catalogue_members(grounding, <sectionarg>, identity=<id>)`
      result — `<sectionarg>` is a string literal | a Name. A Name is resolved
      PER-USE to the binding that reaches THAT `_catalogue_members` call (not the
      union of every same-named binding in the function): the `for …, …,
      section_key in _A3_NOT_ADDRESSED` loop whose body contains the call binds
      `section_key` to its tuple position's value-set ({learner_outcomes,
      areas_for_improvement} at position 2), while a `section_key =
      _A3_GROUNDING_SECTION[k]` assignment reaching the call binds it to that
      module-map's value-set. The admissible path is the `<id>` identity.
    * a helper PARAMETER traced to the call-site argument in the parent parse
      function (this is how G1's `_g1_communication(stakeholder_members=…)` and
      A3's `_a3_selection_list(catalogue_members=…)` resolve).
    * a nested-helper return via the responsibilities-only helper-return
      registry, whose validated paths are their documented contract:

        _responsibility_statements_under_division  -> responsibilities.statement
        _position_labels_under                      -> positions.label
        _responsibility_statements_under_position  -> positions.responsibilities.statement

  (`members=None` / index sources / non-catalogue sources are skipped.)

  A spec with no catalogue-backed raise-site reachable from its parse
  function has an empty checked-section set -> nothing to flag (its free-text
  fields are governed by `planner._freetext_audit`, not this guard).

  `_self_test()` independently re-enumerates every `_check_in_catalogue(spec=…)`
  AST node + the parse function it is reachable from, and asserts the tracer
  emitted a non-empty `(section, identity)` for each catalogue-backed
  raise-site — failing by name on a missed raise-site, an unresolved
  section-key constant, a `spec=` tag inconsistent with its enclosing parse
  function, or a consumed nested helper absent from the registry.

  ASSERT: for each checked section, every non-parenthetical surfaced
  field-path under that section equals the admissible identity field-path.
  Any other (context) field of a checked section in citable position FAILS,
  naming spec | field-path | rendered line. Exits non-zero on any violation.

Read-only against the substrate data files, the snippets, and the dev DB
grounding; mutates nothing.
"""

from __future__ import annotations

import ast
import inspect
import re
import sys
from pathlib import Path
from typing import Any, TypeGuard

# Resolve workshop helpers via the local package path; the helpers add
# Django to sys.path so the production imports work transparently.
sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatch._workshop import (  # noqa: E402
    _PARSE_FN_NAMES,
    assemble_spec_body,
    flatten_draft_for_grounding,
    get_parse_function,
    get_tenant_school,
    load_draft,
    load_fragments,
    load_prompt_spec,
    load_snippet,
    setup_django,
)

# Sentinel prefix + path separator. The separator is a token that cannot
# appear in a section key or a Python identifier field name, so the
# decode (split on the separator) is unambiguous.
_SENTINEL_PREFIX = "SENTINEL"
_SEP = "__"

# The catalogue-membership producer + consumer the tracer keys off.
_MEMBERS_FN = "_catalogue_members"
_CHECK_FN = "_check_in_catalogue"

# The three responsibilities-only nested helpers and the (section,
# field-path) each one's RETURN validates — its documented contract (the one
# place a return shape is not derivable from `_catalogue_members`/identity, so
# it is registered explicitly; the self-test fails if a consumed helper is
# absent here).
_NESTED_HELPER_RETURNS: dict[str, tuple[str, str]] = {
    "_responsibility_statements_under_division": (
        "division_responsibility_atoms",
        "responsibilities.statement",
    ),
    "_position_labels_under": (
        "division_responsibility_atoms",
        "positions.label",
    ),
    "_responsibility_statements_under_position": (
        "division_responsibility_atoms",
        "positions.responsibilities.statement",
    ),
}


def _sentinelize(value: Any, section: str, path: tuple[str, ...]) -> Any:
    """Return a deep copy of `value` with every string/scalar leaf replaced
    by a path-encoding sentinel string. Dict keys are preserved; list
    indices are collapsed (each element re-uses the same path). Non-leaf
    containers recurse. Empty containers stay empty (no leaf -> no
    sentinel)."""
    if isinstance(value, dict):
        return {k: _sentinelize(v, section, path + (k,)) for k, v in value.items()}
    if isinstance(value, list):
        return [_sentinelize(v, section, path) for v in value]
    # Leaf (str / int / float / bool / None). Encode section + dotted path.
    return _SEP.join((_SENTINEL_PREFIX, section, ".".join(path)))


def _surfaced_sentinels_by_line(rendered: str) -> list[tuple[str, str]]:
    """Return `(section_dot_path, line)` for every sentinel occurrence whose
    position on its rendered line is NOT inside a `(...)` group.

    Paren-membership is computed by a left-to-right scan of round brackets over
    the WHOLE rendered text: a character is "inside parens" when the running
    open-paren depth at its position is > 0. The depth is carried ACROSS lines
    (initialized once, never reset per line) so a sentinel rendered on a
    continuation line inside a `(...)` opened on a PRIOR line is correctly
    treated as parenthetical context."""
    token_re = re.compile(re.escape(_SENTINEL_PREFIX + _SEP) + r"([A-Za-z0-9_.]+)")
    out: list[tuple[str, str]] = []
    depth = 0  # carried across lines: a multi-line `(...)` keeps depth > 0
    for line in rendered.splitlines():
        # Precompute, for each char index, whether it sits inside parens.
        inside: list[bool] = []
        for ch in line:
            if ch == "(":
                depth += 1
                inside.append(True)  # the "(" itself counts as inside
            elif ch == ")":
                inside.append(depth > 0)
                depth = max(0, depth - 1)
            else:
                inside.append(depth > 0)
        for m in token_re.finditer(line):
            start = m.start()
            if start < len(inside) and inside[start]:
                continue  # parenthetical context — safe
            # Decode `<section>__<dotted.path>`: section is the first
            # segment, the remainder (joined) is the dotted field-path.
            decoded = m.group(0)[len(_SENTINEL_PREFIX + _SEP) :]
            out.append((decoded, line))
    return out


def _decode(section_dot_path: str) -> tuple[str, str]:
    """Split a decoded sentinel body `<section>__<dotted.path>` into
    `(section, dotted_path)`. Section is everything up to the first `__`;
    the remainder is the dotted field-path."""
    section, _, dotted = section_dot_path.partition(_SEP)
    return section, dotted


# --- AST/dataflow tracer over planner.specs --------------------------------
#
# The tracer answers, per parse function: which catalogue sections (with which
# admissible identity field-path) does a `_check_in_catalogue` raise-site that
# is reachable from the parse function actually CONSUME? It resolves variable
# section-keys, sub-validator parameters, and the responsibilities nested
# helpers — the three sources a member can reach a raise-site through that a
# text-match over `_catalogue_members(...)` literals never sees.
#
# Sentinel for "this section-key source could not be resolved to a value-set".
# A raise-site that resolves to this is surfaced by the self-test as an
# unresolved-section-key failure, never silently dropped.
_UNRESOLVED = "<unresolved-section-key>"


class _SpecsModule:
    """Parsed `planner.specs`: the module AST, its function defs, and a
    module-level literal-constant table. Built once, cached on the module."""

    def __init__(self) -> None:
        from planner import specs as _specs  # late: Django on path first

        self.source_path = inspect.getsourcefile(_specs)
        src = Path(self.source_path).read_text(encoding="utf-8")  # type: ignore[arg-type]
        self.tree = ast.parse(src)
        self.functions: dict[str, ast.FunctionDef] = {}
        self.constants: dict[str, Any] = {}
        for node in self.tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self.functions[node.name] = node  # type: ignore[assignment]
            elif isinstance(node, ast.Assign):
                for tgt in node.targets:
                    if isinstance(tgt, ast.Name):
                        try:
                            self.constants[tgt.id] = ast.literal_eval(node.value)
                        except (ValueError, TypeError, SyntaxError):
                            pass  # not a literal constant (e.g. a comprehension)
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                if node.value is not None:
                    try:
                        self.constants[node.target.id] = ast.literal_eval(node.value)
                    except (ValueError, TypeError, SyntaxError):
                        pass


_SPECS_CACHE: _SpecsModule | None = None


def _specs_module() -> _SpecsModule:
    global _SPECS_CACHE
    if _SPECS_CACHE is None:
        setup_django()
        _SPECS_CACHE = _SpecsModule()
    return _SPECS_CACHE


def _const_value_set(name: str) -> set[Any] | None:
    """The set of string values a module constant `name` can contribute as a
    section-key. A dict contributes its VALUES; a tuple/list-of-tuples
    contributes the str entries of each tuple (the `_A3_NOT_ADDRESSED` shape —
    the loop body picks one positionally, but any tuple position may be a
    section-key, so the value-set is the union of the tuple's str entries).
    Returns None when the constant is absent / not a recognised shape."""
    consts = _specs_module().constants
    if name not in consts:
        return None
    val = consts[name]
    if isinstance(val, dict):
        return {v for v in val.values() if isinstance(v, str)}
    if isinstance(val, (tuple, list)):
        out: set[Any] = set()
        for entry in val:
            if isinstance(entry, str):
                out.add(entry)
            elif isinstance(entry, (tuple, list)):
                out.update(e for e in entry if isinstance(e, str))
        return out
    return None


def _resolve_section_keys(node: ast.AST, fn: ast.FunctionDef) -> set[str]:
    """Resolve a `_catalogue_members` section-key argument expression to the
    set of section names it can take. Handles a string literal, a Name bound
    to a module-map subscript (`_A3_GROUNDING_SECTION[k]`), and a loop target
    over a module tuple-of-tuples (`for …, …, section_key in _A3_NOT_ADDRESSED`).
    An unresolvable expression yields `{_UNRESOLVED}` (the self-test bites).

    The Name resolution is PER-USE: the binding that actually reaches THIS use
    of the name (the for-loop whose body contains it, else the nearest
    preceding assignment in the same scope) is selected — not the union of all
    same-named bindings in `fn`. So a `section_key` read inside the
    `_A3_NOT_ADDRESSED` loop resolves to that loop's position-2 value-set,
    while a `section_key` read in a `_A3_GROUNDING_SECTION[...]` assignment's
    block resolves to that map's value-set."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return {node.value}
    if isinstance(node, ast.Name):
        # The Name is bound somewhere in `fn`: a subscript of a module map, a
        # for-loop target over a module tuple, or `= <literal>`. Resolve to the
        # binding that reaches THIS use node, not the union of all bindings.
        resolved = _resolve_name_section_keys(node.id, fn, use=node)
        return resolved if resolved else {_UNRESOLVED}
    if isinstance(node, ast.Subscript):
        # An inline `_MAP[k]` (defensive — section args are normally a Name).
        keys = _subscript_value_set(node)
        return keys if keys else {_UNRESOLVED}
    return {_UNRESOLVED}


def _subscript_value_set(node: ast.Subscript) -> set[str] | None:
    """`_SOME_MAP[<key>]` -> the module map's value-set (over all keys, since
    the key is data-dependent at the call we cannot pin one)."""
    if isinstance(node.value, ast.Name):
        return _const_value_set(node.value.id)
    return None


def _node_contains(outer: ast.AST, inner: ast.AST) -> bool:
    """True when `inner` is lexically inside `outer` (by line span). Uses
    `lineno`/`end_lineno` so a use is matched to the for-loop body that
    encloses it without re-walking the subtree per candidate."""
    o_lo = getattr(outer, "lineno", None)
    o_hi = getattr(outer, "end_lineno", None)
    i_lo = getattr(inner, "lineno", None)
    if o_lo is None or o_hi is None or i_lo is None:
        return False
    i_hi = getattr(inner, "end_lineno", i_lo)
    return o_lo <= i_lo and i_hi <= o_hi


def _resolve_name_section_keys(
    name: str, fn: ast.FunctionDef, use: ast.AST | None = None
) -> set[str]:
    """Resolve a local `name` used as a section-key to its value-set.

    When `use` (the Name read being resolved) is given, select the binding
    that REACHES that use rather than unioning every same-named binding in
    `fn`: a `for (…, name, …) in _CONST` loop whose body lexically contains
    the use wins (resolved POSITIONALLY); otherwise the nearest preceding
    `name = _MAP[k]` / `name = "<literal>"` assignment in lexical order. With
    `use=None` the behavior is the prior union over all bindings (kept for any
    caller that has no use context)."""
    # Collect candidate bindings with their lineno + resolved value-set.
    for_bindings: list[tuple[ast.For, set[str]]] = []
    assign_bindings: list[tuple[ast.Assign, set[str]]] = []
    for sub in ast.walk(fn):
        # Assignment binding: name = <expr>
        if isinstance(sub, ast.Assign):
            for tgt in sub.targets:
                if isinstance(tgt, ast.Name) and tgt.id == name:
                    vs: set[str] = set()
                    if isinstance(sub.value, ast.Subscript):
                        sub_vs = _subscript_value_set(sub.value)
                        if sub_vs:
                            vs = sub_vs
                    elif isinstance(sub.value, ast.Constant) and isinstance(sub.value.value, str):
                        vs = {sub.value.value}
                    if vs:
                        assign_bindings.append((sub, vs))
        # For-loop target binding: for (a, b, name) in _CONST: ...  — resolve
        # POSITIONALLY so `for output_key, targeted_field, section_key in
        # _A3_NOT_ADDRESSED` binds `section_key` to the THIRD tuple position
        # only (not the union of all positions).
        if isinstance(sub, ast.For) and isinstance(sub.iter, ast.Name):
            pos = _target_position(sub.target, name)
            if pos is not None:
                loop_vs = _const_tuple_position_values(sub.iter.id, pos)
                if loop_vs:
                    for_bindings.append((sub, loop_vs))

    if use is not None:
        # 1) The for-loop whose body lexically contains the use takes
        #    precedence (the use reads the loop-bound name). The most-tightly-
        #    enclosing such loop wins.
        enclosing = [
            (loop, vs)
            for loop, vs in for_bindings
            if any(_node_contains(b, use) for b in loop.body)
        ]
        if enclosing:
            enclosing.sort(key=lambda lv: lv[0].lineno)
            return enclosing[-1][1]
        # 2) Otherwise the nearest preceding assignment (largest lineno < use
        #    lineno) reaches the use.
        use_lineno = getattr(use, "lineno", None)
        if use_lineno is not None:
            preceding = [(a, vs) for a, vs in assign_bindings if a.lineno <= use_lineno]
            if preceding:
                preceding.sort(key=lambda av: av[0].lineno)
                return preceding[-1][1]

    # Fallback (no use context, or no reaching binding found): union all.
    out: set[str] = set()
    for _loop, vs in for_bindings:
        out.update(vs)
    for _a, vs in assign_bindings:
        out.update(vs)
    return out


def _target_position(target: ast.AST, name: str) -> int | None:
    """Index of `name` within a tuple/list for-target; -1 for a bare `Name`
    target equal to `name`; None when `name` is not bound by the target."""
    if isinstance(target, ast.Name):
        return -1 if target.id == name else None
    if isinstance(target, (ast.Tuple, ast.List)):
        for i, elt in enumerate(target.elts):
            if isinstance(elt, ast.Name) and elt.id == name:
                return i
    return None


def _const_tuple_position_values(const_name: str, pos: int) -> set[str] | None:
    """The str values at tuple position `pos` across each entry of a module
    tuple/list-of-tuples constant. `pos == -1` (bare-Name target over a
    tuple-of-str) returns the str entries directly."""
    consts = _specs_module().constants
    if const_name not in consts:
        return None
    val = consts[const_name]
    if not isinstance(val, (tuple, list)):
        return None
    out: set[str] = set()
    for entry in val:
        if pos == -1:
            if isinstance(entry, str):
                out.add(entry)
        elif isinstance(entry, (tuple, list)) and pos < len(entry):
            cell = entry[pos]
            if isinstance(cell, str):
                out.add(cell)
    return out


def _members_call_section_paths(call: ast.Call, fn: ast.FunctionDef) -> set[tuple[str, str]]:
    """A `_catalogue_members(grounding, <sectionarg>, identity=<id>)` call ->
    the set of `(section, identity)` pairs it can produce (section may fan out
    when the key is a module-map / tuple value-set)."""
    section_arg: ast.AST | None = None
    if len(call.args) >= 2:
        section_arg = call.args[1]
    identity = None
    for kw in call.keywords:
        if kw.arg == "identity" and isinstance(kw.value, ast.Constant):
            identity = kw.value.value
    if section_arg is None or not isinstance(identity, str):
        return {(_UNRESOLVED, identity if isinstance(identity, str) else _UNRESOLVED)}
    return {(section, identity) for section in _resolve_section_keys(section_arg, fn)}


def _is_call_to(node: ast.AST, fn_name: str) -> TypeGuard[ast.Call]:
    return (
        isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == fn_name
    )


def _resolve_members_expr(
    expr: ast.AST, fn: ast.FunctionDef, _seen: tuple[str, ...] = ()
) -> set[tuple[str, str]]:
    """Resolve a `_check_in_catalogue(members=<expr>)` argument to the set of
    `(section, identity-path)` it can carry, traced through:
      * a local bound to a `_catalogue_members(...)` result,
      * a local bound to a nested-helper call (registry return),
      * a PARAMETER of `fn`, traced to the call-site argument in every caller
        of `fn` within specs.py.
    `members=None` / index / non-catalogue sources -> empty set (skipped).

    `expr` is the USE node (it carries its lineno), so a member-local with
    several bindings resolves to the one that REACHES this use, not the union
    of all of them — the same per-use precision the section-key resolution
    applies. This keeps the not-addressed raise-site (whose `members` is the
    `_A3_NOT_ADDRESSED`-loop binding) from over-resolving to the subscript-loop
    bindings of the same `members` local."""
    # `members=None` literal — skip.
    if isinstance(expr, ast.Constant) and expr.value is None:
        return set()
    # Inline `_catalogue_members(...)` (defensive — normally a Name).
    if _is_call_to(expr, _MEMBERS_FN):
        return _members_call_section_paths(expr, fn)
    if isinstance(expr, ast.Name):
        return _resolve_local_or_param(expr.id, fn, _seen, use=expr)
    return set()


def _resolve_local_or_param(
    name: str, fn: ast.FunctionDef, seen: tuple[str, ...], use: ast.AST | None = None
) -> set[tuple[str, str]]:
    """Resolve a member-bearing local/parameter `name` in `fn`.

    When `use` (the Name read being resolved) is given and `name` has multiple
    local bindings, the binding that REACHES that use is selected (the for-loop
    body that contains the use, else the nearest preceding assignment) rather
    than the union of all bindings — so a member read inside the
    `_A3_NOT_ADDRESSED` loop resolves to that loop iteration's
    `_catalogue_members(...)`, not every `members =` in the function."""
    # 1) Local assignment(s): name = _catalogue_members(...) | name = <helper>(...)
    assigns: list[ast.Assign] = []
    for sub in ast.walk(fn):
        if isinstance(sub, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == name for t in sub.targets
        ):
            assigns.append(sub)
    if assigns:
        chosen = _select_reaching_assigns(assigns, fn, use)
        out: set[tuple[str, str]] = set()
        for a in chosen:
            val = a.value
            if _is_call_to(val, _MEMBERS_FN):
                out |= _members_call_section_paths(val, fn)
            elif (
                isinstance(val, ast.Call)
                and isinstance(val.func, ast.Name)
                and val.func.id in _NESTED_HELPER_RETURNS
            ):
                out.add(_NESTED_HELPER_RETURNS[val.func.id])
            # else: a non-catalogue local (index, count) — contributes
            # nothing; the self-test only requires catalogue raise-sites.
        return out
    # 2) Parameter of `fn`: trace to each call-site argument in callers.
    param_names = {a.arg for a in fn.args.args} | {a.arg for a in fn.args.kwonlyargs}
    if name in param_names:
        return _resolve_param_via_callers(fn.name, name, seen)
    return set()


def _select_reaching_assigns(
    assigns: list[ast.Assign], fn: ast.FunctionDef, use: ast.AST | None
) -> list[ast.Assign]:
    """Of several assignments to one name, the binding(s) that reach `use`.

    With `use`: a single assignment is returned — the one inside the for-loop
    body that lexically contains the use (the nearest such loop's binding),
    else the nearest preceding assignment by lineno. Without `use`, or when no
    reaching binding is found, all assignments are returned (prior union)."""
    if use is None or len(assigns) == 1:
        return assigns
    use_lineno = getattr(use, "lineno", None)
    if use_lineno is None:
        return assigns
    # For-loops in `fn` whose body contains the use, innermost (largest lineno)
    # first — an assignment inside that loop body is the reaching binding.
    enclosing_loops = sorted(
        (
            loop
            for loop in ast.walk(fn)
            if isinstance(loop, ast.For) and any(_node_contains(b, use) for b in loop.body)
        ),
        key=lambda lp: lp.lineno,
        reverse=True,
    )
    for loop in enclosing_loops:
        in_loop = [a for a in assigns if any(_node_contains(b, a) for b in loop.body)]
        if in_loop:
            in_loop.sort(key=lambda a: a.lineno)
            return [in_loop[-1]]
    # Otherwise the nearest preceding assignment by lineno.
    preceding = [a for a in assigns if a.lineno <= use_lineno]
    if preceding:
        preceding.sort(key=lambda a: a.lineno)
        return [preceding[-1]]
    return assigns


def _resolve_param_via_callers(
    fn_name: str, param: str, seen: tuple[str, ...]
) -> set[tuple[str, str]]:
    """Trace a parameter `param` of `fn_name` to the value passed at every
    call-site of `fn_name` within specs.py, resolving each call-site argument
    in ITS enclosing function."""
    if fn_name in seen:
        return set()  # guard against pathological recursion
    seen = seen + (fn_name,)
    mod = _specs_module()
    out: set[tuple[str, str]] = set()
    for caller in mod.functions.values():
        for sub in ast.walk(caller):
            if not _is_call_to(sub, fn_name):
                continue
            arg_expr = _call_keyword_arg(sub, param)  # keyword-passed
            if arg_expr is None:
                arg_expr = _call_positional_arg(sub, fn_name, param)
            if arg_expr is not None:
                out |= _resolve_members_expr(arg_expr, caller, seen)
    return out


def _call_keyword_arg(call: ast.Call, name: str) -> ast.AST | None:
    for kw in call.keywords:
        if kw.arg == name:
            return kw.value
    return None


def _call_positional_arg(call: ast.Call, fn_name: str, param: str) -> ast.AST | None:
    """Map a positional call argument to `param` by `fn_name`'s parameter order."""
    fn = _specs_module().functions.get(fn_name)
    if fn is None:
        return None
    pos_params = [a.arg for a in fn.args.args]
    if param in pos_params:
        idx = pos_params.index(param)
        if idx < len(call.args):
            return call.args[idx]
    return None


def _functions_reachable_from(fn_name: str) -> set[str]:
    """The set of specs.py function names transitively called from `fn_name`
    (including itself). Used to scope which `_check_in_catalogue` raise-sites
    belong to a parse function."""
    mod = _specs_module()
    out: set[str] = set()
    stack = [fn_name]
    while stack:
        cur = stack.pop()
        if cur in out:
            continue
        out.add(cur)
        fn = mod.functions.get(cur)
        if fn is None:
            continue
        for sub in ast.walk(fn):
            if (
                isinstance(sub, ast.Call)
                and isinstance(sub.func, ast.Name)
                and sub.func.id in mod.functions
                and sub.func.id not in out
            ):
                stack.append(sub.func.id)
    return out


def _checked_section_paths_for_fn(fn_name: str) -> set[tuple[str, str]]:
    """Every `(section, identity-path)` consumed by a `_check_in_catalogue`
    raise-site reachable from parse function `fn_name`. Drops `_UNRESOLVED`
    and `members=None` sources (the self-test, separately, fails on an
    unresolved section-key)."""
    mod = _specs_module()
    reachable = _functions_reachable_from(fn_name)
    out: set[tuple[str, str]] = set()
    for host_name in reachable:
        host = mod.functions.get(host_name)
        if host is None:
            continue
        for sub in ast.walk(host):
            if not _is_call_to(sub, _CHECK_FN):
                continue
            members_expr = _call_keyword_arg(sub, "members")
            if members_expr is None:
                members_expr = _call_positional_arg(sub, _CHECK_FN, "members")
            if members_expr is None:
                continue
            for section, identity in _resolve_members_expr(members_expr, host):
                if section == _UNRESOLVED or identity == _UNRESOLVED:
                    continue
                out.add((section, identity))
    return out


def _checked_sections_for(spec_key: str) -> dict[str, set[str]]:
    """Derive `{section: {admissible_field_path, ...}}` for `spec_key` from the
    AST/dataflow trace of every `_check_in_catalogue` raise-site reachable
    from its parse function. Empty dict when the spec checks no catalogue."""
    # Resolve the parse function's NAME via the registry (the source-of-truth
    # bridge); `get_parse_function` confirms it resolves in planner.specs.
    get_parse_function(spec_key)
    out: dict[str, set[str]] = {}
    for section, path in _checked_section_paths_for_fn(_PARSE_FN_NAMES[spec_key]):
        out.setdefault(section, set()).add(path)
    return out


# --- Self-test (the tracer's own gate) -------------------------------------
#
# `spec=` codes are human-readable validator labels, NOT the registry
# spec_key, and one code can differ from the function it lives in (e.g.
# `spec="F1"` is raised inside `parse_decompose_action_steps`). The expected
# code per parse function is asserted below so a `spec=` tag drifting from its
# home parse function is caught.
_EXPECTED_SPEC_CODE: dict[str, str] = {
    "parse_decompose_action_steps": "F1",
    "parse_propose_milestones": "D1",
    "parse_suggest_feedback_channels": "C1",
    "parse_propose_assignments": "F2",
    "parse_propose_evidence": "F5",
    "parse_propose_responsibilities": "US-LLM-27",
    "parse_propose_accreditation_standards": "A2",
    "parse_propose_domain_alignment": "A3",
    "parse_propose_review_loop": "G1",
}


def _parse_fns_reaching(host_fn: str) -> list[str]:
    """The registry parse functions from which `host_fn` is reachable."""
    out: list[str] = []
    for fn_name in _PARSE_FN_NAMES.values():
        if host_fn in _functions_reachable_from(fn_name):
            out.append(fn_name)
    return out


class SelfTestError(AssertionError):
    """Raised when the AST tracer fails to cover a `_check_in_catalogue`
    raise-site (or hits an unresolved section-key / inconsistent spec= tag /
    unregistered nested helper)."""


def _self_test() -> None:
    """Independently re-enumerate every `_check_in_catalogue(spec=…)` raise-site
    in planner.specs and assert the tracer covers each catalogue-backed one.

    Fails by name on: a raise-site whose member source the tracer cannot
    resolve to a non-empty `(section, identity)`; an unresolved section-key
    constant; a `spec=` tag inconsistent with its enclosing parse function;
    or a nested-helper return consumed by a raise-site but absent from
    `_NESTED_HELPER_RETURNS`. Raises `SelfTestError` on any failure."""
    mod = _specs_module()
    failures: list[str] = []

    # Catalogue every `_check_in_catalogue` node with its host function,
    # spec= code, and members expression.
    raise_sites: list[tuple[ast.Call, str, str | None, ast.AST | None]] = []
    for host_name, host in mod.functions.items():
        for sub in ast.walk(host):
            if not _is_call_to(sub, _CHECK_FN):
                continue
            spec_code: str | None = None
            for kw in sub.keywords:
                if kw.arg == "spec" and isinstance(kw.value, ast.Constant):
                    spec_code = kw.value.value if isinstance(kw.value.value, str) else None
            members_expr = _call_keyword_arg(sub, "members") or _call_positional_arg(
                sub, _CHECK_FN, "members"
            )
            raise_sites.append((sub, host_name, spec_code, members_expr))

    if not raise_sites:
        raise SelfTestError(
            "self-test found NO _check_in_catalogue raise-sites in planner.specs "
            "— the consumer the tracer keys off has moved or been renamed"
        )

    # Pre-compute, per parse function, the (section, identity) set the tracer
    # derives — so we can confirm each raise-site's resolution is present.
    derived: dict[str, set[tuple[str, str]]] = {
        fn_name: _checked_section_paths_for_fn(fn_name) for fn_name in _PARSE_FN_NAMES.values()
    }

    for call, host_name, spec_code, members_expr in raise_sites:
        line = call.lineno
        host = mod.functions[host_name]
        reaching = _parse_fns_reaching(host_name)
        if not reaching:
            failures.append(
                f"line {line}: _check_in_catalogue in {host_name}() is not reachable "
                "from any registered parse function (orphaned raise-site)"
            )
            continue

        # spec= tag consistency: every reaching parse fn must expect this code.
        for parse_fn in reaching:
            expected = _EXPECTED_SPEC_CODE.get(parse_fn)
            if expected is not None and spec_code != expected:
                failures.append(
                    f"line {line}: spec={spec_code!r} inconsistent with enclosing "
                    f"parse function {parse_fn}() (expected {expected!r})"
                )

        if members_expr is None:
            failures.append(
                f"line {line}: _check_in_catalogue in {host_name}() has no resolvable "
                "members= argument"
            )
            continue

        # Nested-helper-return coverage: if the member source is a local bound
        # to a helper call, that helper must be registered. Checked BEFORE the
        # resolution check so a consumed-but-unregistered helper is named
        # explicitly (dropping it would also empty the resolution).
        if isinstance(members_expr, ast.Name):
            for sub in ast.walk(host):
                if isinstance(sub, ast.Assign) and any(
                    isinstance(t, ast.Name) and t.id == members_expr.id for t in sub.targets
                ):
                    val = sub.value
                    if (
                        isinstance(val, ast.Call)
                        and isinstance(val.func, ast.Name)
                        and val.func.id.startswith("_")
                        and val.func.id != _MEMBERS_FN
                        and val.func.id in mod.functions
                        and val.func.id not in _NESTED_HELPER_RETURNS
                    ):
                        failures.append(
                            f"line {line}: member source {members_expr.id!r} is bound to "
                            f"helper {val.func.id}() which is not in _NESTED_HELPER_RETURNS"
                        )

        # Resolve THIS raise-site's member source in its host function.
        resolved = _resolve_members_expr(members_expr, host)
        if not resolved:
            failures.append(
                f"line {line}: tracer resolved NO (section, identity) for the "
                f"_check_in_catalogue in {host_name}() (member source "
                f"{ast.dump(members_expr)[:80]} — missed by the tracer)"
            )
            continue
        if any(sec == _UNRESOLVED or ident == _UNRESOLVED for sec, ident in resolved):
            failures.append(
                f"line {line}: unresolved section-key for the _check_in_catalogue "
                f"in {host_name}() (resolved={sorted(resolved)})"
            )
            continue

        # The resolution must surface in EACH reaching parse fn's derived set.
        for parse_fn in reaching:
            if not (resolved & derived[parse_fn]):
                failures.append(
                    f"line {line}: resolved {sorted(resolved)} for {host_name}() does not "
                    f"appear in the derived map of reaching parse fn {parse_fn}()"
                )

    if failures:
        raise SelfTestError("citability tracer self-test FAILED:\n  " + "\n  ".join(failures))


def main() -> int:
    setup_django()

    # The tracer's own gate: a missed raise-site / unresolved key here means
    # the derived checked-section map is unsound, so fail before rendering.
    _self_test()

    from django.template import Context, Template  # type: ignore[import-not-found]

    from ai.services.grounding import build_grounding  # type: ignore[import-not-found]
    from ai.services.prompt_sanitizer import PromptSanitizer  # type: ignore[import-not-found]

    school = get_tenant_school()
    draft = load_draft()
    flat_draft_state = flatten_draft_for_grounding(draft)
    seed = (draft.get("meta") or {}).get("seed_text", "") or ""

    fragments = load_fragments()
    spec_keys = list(_PARSE_FN_NAMES.keys())

    passes = 0
    violations: list[str] = []

    for spec_key in spec_keys:
        frontmatter, _ = load_snippet(spec_key)
        spec = load_prompt_spec(spec_key)

        checked = _checked_sections_for(spec_key)

        grounding = build_grounding(
            school,
            draft_state=flat_draft_state,
            include=frontmatter.get("grounding_sections") or None,
        )
        grounding = PromptSanitizer.sanitize_data_dict(grounding)

        # Replace every leaf of each CHECKED section with a path-encoding
        # sentinel. (Unchecked sections are out of scope, so leaving them
        # as their real values is harmless — their leaves never carry the
        # SENTINEL prefix, so the scan ignores them.)
        sentinel_grounding = dict(grounding)
        for section in checked:
            if section in sentinel_grounding:
                sentinel_grounding[section] = _sentinelize(sentinel_grounding[section], section, ())

        context = {**sentinel_grounding, "seed": seed}
        body = assemble_spec_body(spec, fragments)
        rendered = Template(body).render(Context(context, autoescape=False))

        spec_violations: list[str] = []
        for decoded, line in _surfaced_sentinels_by_line(rendered):
            section, fieldpath = _decode(decoded)
            if section not in checked:
                continue  # not a structurally-checked section -> out of scope
            admissible = checked[section]
            if fieldpath in admissible:
                continue  # the admissible identity field-path -> citable OK
            spec_violations.append(
                f"  {spec_key} | section={section} | field-path={fieldpath!r} "
                f"(admissible={sorted(admissible)}) | line: {line.strip()}"
            )

        if spec_violations:
            print(f"FAIL  {spec_key}")
            # De-dup identical lines (a section iterates >1 row -> repeats).
            for v in sorted(set(spec_violations)):
                print(v)
            violations.extend(sorted(set(spec_violations)))
        else:
            passes += 1
            print(f"PASS  {spec_key}")

    total = len(spec_keys)
    print()
    print(f"GATE: {passes}/{total}")
    if violations:
        print(f"\n{len(violations)} citability violation(s):")
        for v in violations:
            print(v)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
