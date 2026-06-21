## Phase 13 — i18n initialization

**Verification at end:** translated fields render as grouped per-language fields in admin (both `en` and `zh_Hans` inputs visible together under each base field, no JavaScript widget); `/admin/` switches language via `Accept-Language` or the admin language picker; `.po` files compile.
**Cross-cutting; touches every prior app's translated fields.**

> Note (supersedes an earlier "language tabs" wording): the per-language fields are presented **grouped** via modeltranslation's `TranslationAdmin` base, NOT the JavaScript `TabbedTranslationAdmin`. The tabbed widget is `.tabs()` from jQuery UI, whose only stock source is `//ajax.googleapis.com` — a CDN structurally unreachable from this build network (DISC-01-0519-A) and routinely blocked in the school's China network. With two languages, grouped (both inputs visible at once) is also the friendlier layout than tabs (which hide one language behind a click). `TranslationAdmin` carries no `Media` and pulls in no jQuery UI, dissolving the dependency entirely while delivering the same authorable per-language fields.


### Inventory of translated fields by app (cumulative through Phase 12)

This is the full set of fields whose `TranslationOptions` is registered across Phases 1–12. Every entry below is sourced from the i18n spec or the phase doc that introduced the field.

**`users/translation.py`** — none.

**`school/translation.py`:**
- `LearnerOutcome.label`
- `MissionArea.label`
- `AreaForImprovement.label`
- `Policy.label`, `Policy.notes`
- `Department.label`, `Department.scope_summary`
- `StakeholderGroup.label`
- `PlanningMethod.name`, `PlanningMethod.rationale`
- `PlanningStep.template`

**`accreditation/translation.py`** — none. Per i18n spec: `AccreditationStandard.text` is authoritative English; not registered.

**`plans/translation.py`:**
- `Plan.title`, `Plan.current_state`, `Plan.desired_state`, `Plan.rationale`
- `SuccessCriterion.text`
- `FeedbackChannel.label`, `FeedbackChannel.instrument`
- `Phase.label`
- `ActionStep.description`
- `SubStep.description`
- `Communication.channel`
- `Evidence.label`

**Additional translated fields registered in their introducing phases:** `Plan.theme`, `Plan.priority_rationale`, `Plan.student_impact_framing`, `Plan.provenance` (Phase 14); `ReviewEvent.label`, `ReviewEvent.scheduled_note`, `RevisionRule.condition`, `RevisionRule.action` (Phase 11); `PlanAccreditationStandard.rationale` (Phase 6); `Timeline.note`, `RequiredResource.note` are not translated (operational notes, not school-authored narrative).

### Dev steps

1. **Wire the admin to render translated fields as grouped per-language fields (delivers this phase's verification clause).**

   For every model that has a `TranslationOptions` registration, change its admin representation's base class to modeltranslation's (non-tabbed, no-JavaScript) grouped bases. **Derive the set of models from the actual `school/translation.py` and `plans/translation.py` files — read them as the source of truth** (the inventory above predates the DISC-02-0519-B registrations and is not authoritative for this step). `accreditation` and `users` register no translated fields; their admins are unchanged.

   - Each `ModelAdmin` registered for a translated-field model → base class `modeltranslation.admin.TranslationAdmin` (replacing `admin.ModelAdmin`). Do NOT use `TabbedTranslationAdmin` or `TabbedExternalJqueryTranslationAdmin` — those carry a `Media` that loads jQuery UI from `//ajax.googleapis.com` (unreachable per DISC-01-0519-A; blocked in China). `TranslationAdmin` has no `Media` and pulls in no jQuery UI.
   - Each `TabularInline` whose model has translated fields (e.g. `PlanAccreditationStandard`, `RevisionRule` under `ReviewEventAdmin`) → `modeltranslation.admin.TranslationTabularInline`.
   - Each `StackedInline` whose model has translated fields (e.g. `SubStep`) → `modeltranslation.admin.TranslationStackedInline`.
   - Inlines whose models have NO translated fields (`Measurement`, `MeasurementChannel`, `PlanPredecessor`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency`, `ReviewEventInput`) stay on the stock admin inline bases.

   Leave existing `fieldsets`, `list_display`, `list_filter`, `autocomplete_fields`, `filter_horizontal`, etc. intact in content; modeltranslation patches fieldset entries that reference a translated field name into their per-language variants automatically. Under the project's mypy config, subclassing a `modeltranslation.admin` base resolves Django's real `list_display`/`list_filter`/`fieldsets: list[Any]` annotations, so any of these declared as a **tuple** will trip `[assignment]`; declare them as **list literals** on every converted admin (preferred over `# type: ignore`). No settings change is required — there is no jQuery UI URL to configure, no `STATICFILES_DIRS`, and no vendored asset.

2. From each app directory (`users/`, `school/`, `accreditation/`, `plans/`), run:

   ```
   uv run python manage.py makemessages -l en -l zh_Hans
   ```

   This walks each app's source for `_()` and `{% trans %}` calls and produces `.po` files under each app's `locale/{en,zh_Hans}/LC_MESSAGES/django.po`.

3. Spot-check the generated `.po` files cover:
    - Model field verbose names (every `_("...")` in a model field declaration).
    - Choice labels (every `_("...")` in a `TextChoices` member).
    - `Meta.verbose_name` and `verbose_name_plural`.
    - Admin headings: `fieldsets` titles, filter titles, action descriptions.
    - App `verbose_name` set in each `apps.py`.

4. `uv run python manage.py compilemessages` — produces `.mo` files. `.mo` files are git-ignored per Phase 0 step 7; `compilemessages` runs in pre-commit and at container start per the i18n preamble pattern. A clean `compilemessages` exit is the "`.po` files compile" verification gate.

### Deferred verification (post-Phase-15 browser pass)

Per the batched-verification convention, the human/browser confirmation — open `/admin/`, observe grouped per-language fields on every translated-field model, switch language via the admin picker and via the `Accept-Language` header, watch field/choice labels change — is folded into the single post-Phase-15 pass, not performed as a numbered step here. The in-phase automated test below covers the rendered form non-interactively so the wiring is gated, not left solely to that human pass.

### Tests (extend `plans/tests/` and/or `school/tests/`)

Add a `django.test.Client`-based test (e.g. `plans/tests/test_admin_translation_fields.py`) that, authenticated as a superuser via `force_login`, GETs representative admin add/change forms and asserts: (a) the per-language inputs for a translated field are present in the rendered page (e.g. for a Plan, both `title_en` and `title_zh_hans` widgets render) — covering at least one `school` ModelAdmin, at least one `plans` ModelAdmin, and at least one admin carrying a translated-field inline; and (b) the page loads NO jQuery UI from a CDN — assert `ajax.googleapis.com` (and any `jquery-ui` external URL) is absent, guarding against accidental reintroduction of the tabbed/jQuery-UI dependency. This pulls the admin-rendering change into the automated per-phase gate per the config-vs-behavior convention (an admin-rendering change is behavior, machine-tested; only stock declarative config is left to the browser pass).

### Unresolved (no source in repo)

(none)
