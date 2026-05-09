/**
 * Lens-validator dispatch registry.
 *
 * Modules implementing lens-shaped validation (e.g. roadmap-plan) register
 * a LensValidator at module-init time via `registerLensValidator`. The
 * project-sdk's validateProject iterates the registered set and merges
 * each validator's issues into the project-validation result.
 *
 * Aim: keep project-sdk free of hardcoded imports of lens-shaped modules
 * so additional lenses can land without editing project-sdk.ts. The
 * dispatch is intentionally a global side-effect — modules that want to
 * participate must be importable from the package barrel so their
 * module-init runs at extension load time.
 *
 * Result shape: validators return an array of project-validation-shaped
 * issues (severity + message + block + field) plus a per-issue `code`
 * slug. The slug is opaque to validateProject; resolution to display
 * strings happens inside the validator (via config.display_strings) so
 * each lens module owns its diagnostic vocabulary end-to-end.
 */

export interface LensValidatorIssue {
	code: string;
	severity: "error" | "warning";
	message: string;
	block: string;
	field?: string;
}

export interface LensValidatorResult {
	status: "clean" | "warnings" | "invalid";
	issues: LensValidatorIssue[];
}

export interface LensValidator {
	name: string;
	validate(cwd: string): LensValidatorResult;
}

const registered: LensValidator[] = [];

/**
 * Register (or replace) a lens-validator by name. Idempotent on `name`:
 * re-registering with the same name replaces the prior entry. Modules
 * registering at top-level should pick stable names so re-imports under
 * test (where module cache survives) do not duplicate the validator.
 */
export function registerLensValidator(v: LensValidator): void {
	const existing = registered.findIndex((r) => r.name === v.name);
	if (existing !== -1) registered[existing] = v;
	else registered.push(v);
}

export function getLensValidators(): readonly LensValidator[] {
	return registered;
}

/**
 * Test-only utility: drop all registered validators. Module-init side-
 * effect testing requires a clean registry between tests; production
 * code should never call this.
 */
export function clearLensValidators(): void {
	registered.length = 0;
}
