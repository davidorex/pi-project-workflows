/**
 * pi-bound — the `pi-context pi-bound` CLI process mode.
 *
 * Replaces the `scripts/launch-constrained-pi.sh` entrypoint with an in-process
 * port that composes the same bounded tool surface and launches an interactive
 * `pi` coding-agent session restricted to it. This is NOT a substrate op (it is
 * not reflected from the op-registry); it is a process mode handled by a bare
 * `pi-bound` verb branch in `main()` (`cli.ts`).
 *
 * The composed surface is the union of:
 *   - static tools derived from the installed packages' generated SKILL.md files
 *   - pi's built-in read-only tools (read / ls / grep / find)
 *   - per-target bounded composites from the active substrate's
 *     config.tool_operations[] (optionally scoped by repeated --grant <id>)
 *
 * The launcher re-derives the full allowlist on EVERY invocation, including pi
 * resumes (`--continue` / `-c`), because pi does not persist per-session --tools
 * restrictions — the constrained surface must be re-passed each launch.
 *
 * Helper pieces (parsePiBoundArgs / resolvePackageRoot / deriveSkillToolNames /
 * readCompositeOperationIds / composePiBoundTools) are exported for unit testing.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { loadContext } from "@davidorex/pi-context/context";

const require = createRequire(import.meta.url);

/** Built-in read-only file-system tools always granted (Bucket-1 default-grant). */
const BUILTIN_READONLY_TOOLS = ["read", "ls", "grep", "find"];

/** The meta-package whose extensions are registered into the target dir's .pi/. */
const META_PACKAGE = "@davidorex/pi-project-workflows";

/** Packages whose own generated SKILL.md files supply the static tool surface. */
const SKILL_PACKAGES = ["@davidorex/pi-context", "@davidorex/pi-project-workflows"];

/**
 * Thrown on a malformed `--grant` (trailing flag with no value). Carries the
 * usage exit code (2) — the NEW contract introduced by this port (the shell
 * script aborted via unbound-variable under `set -u`, never a deliberate exit-2).
 */
export class PiBoundUsageError extends Error {
	readonly exitCode = 2;
	constructor(message: string) {
		super(message);
		this.name = "PiBoundUsageError";
	}
}

/**
 * Partition the pi-bound argv into consumed `--grant <id>` values and the
 * passthrough remainder forwarded verbatim to `pi`.
 *
 * Preserves scripts/launch-constrained-pi.sh:73-80. A trailing `--grant` with no
 * value is a usage error (exit 2) — the explicit contract this port adds.
 */
export function parsePiBoundArgs(argv: string[]): {
	grants: string[];
	passthrough: string[];
} {
	const grants: string[] = [];
	const passthrough: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok === "--grant") {
			const value = argv[i + 1];
			if (value === undefined) {
				throw new PiBoundUsageError("--grant requires a <canonical_id> value");
			}
			grants.push(value);
			i++;
		} else {
			passthrough.push(tok);
		}
	}
	return { grants, passthrough };
}

/**
 * Resolve an installed package's root directory (the dir containing its
 * package.json). Uniform across packages — pi-context's exports map declares
 * `./package.json` so `require.resolve` does not throw ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * Replaces the script's repo-relative META path (launch-constrained-pi.sh:63-64).
 */
export function resolvePackageRoot(pkg: string): string {
	return path.dirname(require.resolve(`${pkg}/package.json`));
}

/**
 * Derive the static tool allowlist by reading `skills/<name>/SKILL.md` under each
 * package root, extracting every `<tool name="...">` tag, deduping, and sorting.
 *
 * Returns the sorted distinct tool names plus the total count of SKILL.md files
 * read (for the `<4` symmetry warning).
 *
 * Preserves scripts/launch-constrained-pi.sh:89-95 (extraction + dedupe + sort)
 * and :122-125 (skill-file count for the warning), without a shell pipeline.
 */
export function deriveSkillToolNames(packageRoots: string[]): {
	tools: string[];
	skillFileCount: number;
} {
	const TOOL_NAME_RE = /<tool\s+name="([a-z0-9-]+)"/g;
	const toolSet = new Set<string>();
	let skillFileCount = 0;
	for (const root of packageRoots) {
		const skillsDir = path.join(root, "skills");
		if (!existsSync(skillsDir)) {
			continue;
		}
		for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}
			const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
			if (!existsSync(skillFile)) {
				continue;
			}
			skillFileCount++;
			const content = readFileSync(skillFile, "utf8");
			for (const match of content.matchAll(TOOL_NAME_RE)) {
				toolSet.add(match[1]);
			}
		}
	}
	return { tools: [...toolSet].sort(), skillFileCount };
}

/**
 * Read the active substrate's declared bounded-composite canonical_ids from
 * config.tool_operations[]. Returns [] when no config is present (no
 * .pi-context.json pointer / no config.json) or on any read failure — folding the
 * helper's exit-4-on-absent-config behavior plus the launch script's `|| echo '[]'`
 * fallback into a single in-process call.
 *
 * Replaces read-config-operations.ts:60-67 + launch-constrained-pi.sh:104.
 */
export function readCompositeOperationIds(cwd: string): string[] {
	try {
		const ctx = loadContext(cwd);
		if (ctx.config === null) {
			return [];
		}
		return (ctx.config.tool_operations ?? []).map((op) => op.canonical_id);
	} catch {
		return [];
	}
}

/**
 * Compose the final ordered, deduped tool allowlist:
 *   static SKILL-derived tools ∪ built-in read-only ∪ (grants ? grants : declared composites)
 *
 * Preserves scripts/launch-constrained-pi.sh:99 (built-in read-only addition) and
 * :111-119 (grant-scoping of composites). Result is sorted for stable output.
 */
export function composePiBoundTools(input: {
	staticTools: string[];
	declaredComposites: string[];
	grants: string[];
}): string[] {
	const { staticTools, declaredComposites, grants } = input;
	const selectedComposites = grants.length > 0 ? grants : declaredComposites;
	const all = [...staticTools, ...BUILTIN_READONLY_TOOLS, ...selectedComposites];
	return [...new Set(all)].sort();
}

/**
 * Thin spawn wrapper: run a command with inherited stdio in the target cwd and
 * resolve its exit code (null exit → 1). Injectable via deps.spawn so tests can
 * assert invocations without launching real subprocesses.
 */
function runCommand(command: string, args: string[], cwd: string, spawnFn: typeof spawn): Promise<number> {
	return new Promise((resolve, reject) => {
		const child = spawnFn(command, args, { cwd, stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code) => resolve(code ?? 1));
	});
}

/**
 * Entrypoint for `pi-context pi-bound [...args]`.
 *
 * Sequence (steps 3-10 run on every launch, including pi resumes):
 *   1. target cwd = deps.cwd ?? process.cwd()
 *   2. parse --grant out of argv
 *   3. warn if <targetCwd>/.pi-context.json absent
 *   4. resolve meta-package root
 *   5. run `pi install -l <metaRoot>` with cwd: targetCwd
 *   6. derive static tools from package skill roots
 *   7. fatal (exit 1) if static tool set is empty
 *   8. warn if skill-file count < 4
 *   9. read declared composites from active substrate config
 *  10. compose tool CSV
 *  11. spawn `pi --tools <csv> ...passthrough` with cwd: targetCwd
 *  12. return child exit code
 */
export async function runPiBound(
	argv: string[],
	deps?: {
		cwd?: string;
		stdout?: NodeJS.WritableStream;
		stderr?: NodeJS.WritableStream;
		spawn?: typeof spawn;
		/**
		 * Test-only override of the package roots whose skills/*\/SKILL.md supply
		 * the static tool surface. Defaults to the two installed package roots
		 * (resolved via resolvePackageRoot). Production callers never pass this;
		 * it exists so the empty-static-tools fatal path is reachable under test
		 * without launching real pi or depending on the build state of node_modules.
		 */
		skillRoots?: string[];
	},
): Promise<number> {
	const targetCwd = deps?.cwd ?? process.cwd();
	const stderr = deps?.stderr ?? process.stderr;
	const spawnFn = deps?.spawn ?? spawn;

	let grants: string[];
	let passthrough: string[];
	try {
		({ grants, passthrough } = parsePiBoundArgs(argv));
	} catch (err) {
		if (err instanceof PiBoundUsageError) {
			stderr.write(`pi-context pi-bound: ${err.message}\n`);
			return err.exitCode;
		}
		throw err;
	}

	if (!existsSync(path.join(targetCwd, ".pi-context.json"))) {
		stderr.write(
			`pi-context pi-bound: WARNING — no .pi-context.json pointer in ${targetCwd}; composites will be empty + substrate ops unavailable. Run /context init <substrate-dir> first OR proceed with limited capability.\n`,
		);
	}

	const metaPackageRoot = resolvePackageRoot(META_PACKAGE);
	await runCommand("pi", ["install", "-l", metaPackageRoot], targetCwd, spawnFn);

	const skillRoots = deps?.skillRoots ?? SKILL_PACKAGES.map((pkg) => resolvePackageRoot(pkg));
	const { tools: staticTools, skillFileCount } = deriveSkillToolNames(skillRoots);

	if (staticTools.length === 0) {
		stderr.write(
			"pi-context pi-bound: no tools derived from packages' skills/*/SKILL.md — is the repo built + skills generated?\n",
		);
		return 1;
	}

	if (skillFileCount < 4) {
		stderr.write(
			`pi-context pi-bound: WARNING — only ${skillFileCount} SKILL.md files found across packages; expected >= 4. Some extensions may be silently absent. Run 'npm run skills'.\n`,
		);
	}

	const declaredComposites = readCompositeOperationIds(targetCwd);
	const tools = composePiBoundTools({ staticTools, declaredComposites, grants });
	const toolsCsv = tools.join(",");

	return runCommand("pi", ["--tools", toolsCsv, ...passthrough], targetCwd, spawnFn);
}
