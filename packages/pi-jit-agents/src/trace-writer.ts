// trace-writer: JSONL persistence layer for the monitor-classify trace capture pipeline (issue-023).
//
// Layered above trace-redactor (T2) and below the executeAgent integration point (T5/T6),
// this module accepts an already-redacted TraceEntry, validates it against
// packages/pi-jit-agents/schemas/agent-trace.schema.json, and atomically appends one JSONL
// line to the configured trace file. Per DEC-0005 (push-write divergence from pi-mono's
// pull/replay model) entries are written immediately at the moment of occurrence inside
// executeAgent rather than reconstructed at session close, so each append must be self-
// validating and crash-safe — a partial write or interleaved write from a concurrent process
// would corrupt the JSONL invariant (one valid JSON document per line).
//
// Crash-safety strategy:
//   - JSONL append uses fs.appendFileSync, mirroring pi-coding-agent's session-manager pattern.
//   - Cross-process safety uses proper-lockfile (already present in the workspace via
//     pi-coding-agent's transitive dependency tree). Node 23.x exposes node:fs flockSync as
//     `undefined` in the version this repo targets, so the userspace lockfile approach is
//     the working option; the lock is held only for the duration of the append.
//   - Schema validation reuses validateFromFile from @davidorex/pi-project/schema-validator
//     so the AJV runtime, error format, and ESM/CJS interop shim live in one place.
//
// Size-rotation strategy:
//   - Before append, stat the target. If it exceeds maxFileSizeBytes (default 500 MB), the
//     writer mints the next available `<base>-NNN.jsonl` split file and appends there. The
//     prior file is left as a closed split. Date-based rotation is exposed separately via
//     dateRotatedPath() so callers compose the two without coupling.

import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFromFile } from "@davidorex/pi-project/schema-validator";
// proper-lockfile is CommonJS — under Node16 module resolution + ESM consumer the default
// import resolves to the module namespace, so lockSync hangs off the default export.
import _properLockfile from "proper-lockfile";

// CJS interop: depending on bundler / tsconfig, the default may be the namespace itself or
// a wrapping `{ default: ns }`. Resolve once at module load.
const properLockfile = ((_properLockfile as unknown as { default?: typeof _properLockfile }).default ??
	_properLockfile) as typeof _properLockfile;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// In dist the module sits at packages/pi-jit-agents/dist/trace-writer.js, in src at
// packages/pi-jit-agents/src/trace-writer.ts. Both resolve to ../schemas relative to the
// module file, since schemas/ ships at the package root.
const TRACE_SCHEMA_PATH = path.resolve(moduleDir, "..", "schemas", "agent-trace.schema.json");

const DEFAULT_MAX_FILE_SIZE_BYTES = 500_000_000;

export interface WriteTraceOptions {
	/** Path to the JSONL file. Will be created if it does not exist. Parent directories will be created. */
	tracePath: string;
	/** Maximum file size in bytes before rotation overflow split. Default 500MB. */
	maxFileSizeBytes?: number;
	/** Skip schema validation. Default false. ONLY for tests. */
	skipValidation?: boolean;
}

/** Append a single TraceEntry to the JSONL file. Validates against the schema. Atomic per-entry write via flock. */
export function writeAgentTrace(entry: unknown, options: WriteTraceOptions): void {
	const maxSize = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

	if (!options.skipValidation) {
		// Throws ValidationError on schema mismatch; descriptive message includes instancePath + reason.
		validateFromFile(TRACE_SCHEMA_PATH, entry, "agent-trace entry");
	}

	const targetPath = resolveSplitTarget(options.tracePath, maxSize);

	// Ensure parent dir exists. mkdirSync is idempotent with recursive: true.
	mkdirSync(path.dirname(targetPath), { recursive: true });

	// Acquire the per-file lock. Fail-fast on contention: proper-lockfile defaults to a
	// short retry window which we override with retries: 0 so a contended write surfaces
	// rather than blocking the dispatch loop indefinitely. The lock requires the target
	// path to exist; create an empty file first if it doesn't.
	if (!existsSync(targetPath)) {
		appendFileSync(targetPath, "");
	}

	const release = properLockfile.lockSync(targetPath, { retries: 0, stale: 5_000, realpath: false });
	try {
		appendFileSync(targetPath, `${JSON.stringify(entry)}\n`);
	} finally {
		release();
	}
}

/**
 * Resolve the actual file path to write to, honoring the size-overflow split policy.
 * If the base path is missing or under maxSize, returns it unchanged. Otherwise scans
 * for the next available `<base>-NNN.jsonl` split.
 */
function resolveSplitTarget(basePath: string, maxSize: number): string {
	if (!existsSync(basePath)) return basePath;
	let size: number;
	try {
		size = statSync(basePath).size;
	} catch {
		return basePath;
	}
	if (size < maxSize) return basePath;

	const ext = path.extname(basePath); // typically ".jsonl"
	const stem = basePath.slice(0, basePath.length - ext.length);
	for (let i = 1; i <= 9999; i++) {
		const suffix = String(i).padStart(3, "0");
		const candidate = `${stem}-${suffix}${ext}`;
		if (!existsSync(candidate)) return candidate;
		let candSize: number;
		try {
			candSize = statSync(candidate).size;
		} catch {
			return candidate;
		}
		if (candSize < maxSize) return candidate;
	}
	throw new Error(`trace-writer: exhausted split suffix range (-001..-9999) for ${basePath}`);
}

/** Mint a date-rotated trace file path: <baseDir>/<YYYY-MM-DD>.jsonl. Caller passes baseDir; helper handles date math. */
export function dateRotatedPath(baseDir: string, date?: Date): string {
	const d = date ?? new Date();
	const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
	const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
	const dd = d.getUTCDate().toString().padStart(2, "0");
	return path.join(baseDir, `${yyyy}-${mm}-${dd}.jsonl`);
}
