/** Project directory name — renamed from .workflow/ to .project/ during monorepo restructure */
import path from "node:path";

export const PROJECT_DIR = ".project";
export const SCHEMAS_DIR = "schemas";

/**
 * Canonical path-builder helpers for `.project/` substructure.
 *
 * Every site that previously hand-built `path.join(cwd, ".project", ...)` now
 * routes through these so the literal `.project` and its subdirectory names
 * exist exactly once. PROJECT_DIR / SCHEMAS_DIR remain for callers that need
 * the bare segment names (e.g. relative-path display strings).
 */
export function projectDir(cwd: string): string {
	return path.join(cwd, PROJECT_DIR);
}

export function schemasDir(cwd: string): string {
	return path.join(cwd, PROJECT_DIR, SCHEMAS_DIR);
}

export function schemaPath(cwd: string, blockName: string): string {
	return path.join(cwd, PROJECT_DIR, SCHEMAS_DIR, `${blockName}.schema.json`);
}

export function agentsDir(cwd: string): string {
	return path.join(cwd, PROJECT_DIR, "agents");
}

export function projectTemplatesDir(cwd: string): string {
	return path.join(cwd, PROJECT_DIR, "templates");
}
