/**
 * Tests for the changelog guard's pure helpers (scripts/check-changelog.ts).
 *
 * Pure-helper coverage — no git, no disk reads of the real repo. Synthetic
 * files[] / changelog text / changed-path sets exercise:
 *   - watchDirsFromFiles: dist/ -> src/ (hasSrc), dist/ -> root *.ts (root-source),
 *     data dirs kept, *.md / README / CHANGELOG dropped, *.ts kept as root glob.
 *   - extractUnreleased: body between ## [Unreleased] and the next ## [.
 *   - changedPackages: surface paths flag the package; docs/test/non-watched do not.
 *   - unreleasedGrew + the decision logic: surface-change-without-growth flagged,
 *     surface-change-with-growth passes, docs-only / CHANGELOG-only / package.json-only
 *     change sets pass (no surface package touched).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	ALL_PACKAGES,
	changedPackages,
	extractUnreleased,
	unreleasedGrew,
	watchDirsFromFiles,
} from "./check-changelog.ts";

describe("watchDirsFromFiles", () => {
	it("maps dist/ -> src/ for a package with a src/ tree", () => {
		const out = watchDirsFromFiles(["dist/", "schemas/", "*.md"], "packages/pi-context", true);
		assert.ok(out.includes("packages/pi-context/src/"));
		assert.ok(!out.some((e) => e.endsWith("*.ts")));
	});

	it("maps dist/ -> root *.ts for a root-source package (no src/ tree)", () => {
		const out = watchDirsFromFiles(
			["dist/", "examples", "agents", "schemas", "skills", "README.md", "CHANGELOG.md"],
			"packages/pi-behavior-monitors",
			false,
		);
		assert.ok(out.includes("packages/pi-behavior-monitors/*.ts"));
		assert.ok(!out.includes("packages/pi-behavior-monitors/src/"));
	});

	it("keeps *.ts as a root glob for a root-source files[] entry", () => {
		const out = watchDirsFromFiles(["*.ts", "*.md", "skills/"], "packages/pi-project-workflows", false);
		assert.ok(out.includes("packages/pi-project-workflows/*.ts"));
		assert.ok(out.includes("packages/pi-project-workflows/skills/"));
	});

	it("keeps data dirs as-is and drops *.md / README.md / CHANGELOG.md", () => {
		const out = watchDirsFromFiles(
			["dist/", "skills/", "schemas/", "samples/", "*.md", "README.md", "CHANGELOG.md"],
			"packages/pi-context",
			true,
		);
		assert.ok(out.includes("packages/pi-context/skills/"));
		assert.ok(out.includes("packages/pi-context/schemas/"));
		assert.ok(out.includes("packages/pi-context/samples/"));
		assert.ok(!out.some((e) => e.includes(".md")));
	});
});

describe("extractUnreleased", () => {
	it("returns the body between ## [Unreleased] and the next ## [", () => {
		const cl =
			"# Changelog\n\n## [Unreleased]\n\n### Added\n- a new export\n\n## [0.26.0] - 2026-05-25\n\n### Added\n- old\n";
		const body = extractUnreleased(cl);
		assert.ok(body.includes("a new export"));
		assert.ok(!body.includes("old"));
	});

	it("returns the tail when no later version heading exists", () => {
		const cl = "# Changelog\n\n## [Unreleased]\n\n- only entry\n";
		assert.ok(extractUnreleased(cl).includes("only entry"));
	});

	it("returns empty string when no [Unreleased] heading exists", () => {
		assert.equal(extractUnreleased("# Changelog\n\n## [0.1.0] - 2026-01-01\n- x\n"), "");
	});
});

describe("changedPackages", () => {
	// Synthetic watch-set resolver: pi-context watches src/+schemas/, the rest empty.
	const watchFor = (pkg: string): string[] =>
		pkg === "pi-context" ? ["packages/pi-context/src/", "packages/pi-context/schemas/"] : [];

	it("flags a package when a src/ path changed", () => {
		assert.deepEqual(changedPackages(["packages/pi-context/src/block-api.ts"], watchFor), ["pi-context"]);
	});

	it("flags a package when a watched data dir path changed", () => {
		assert.deepEqual(changedPackages(["packages/pi-context/schemas/task.schema.json"], watchFor), ["pi-context"]);
	});

	it("does NOT flag for docs / test / CHANGELOG / package.json paths", () => {
		assert.deepEqual(
			changedPackages(
				[
					"packages/pi-context/CHANGELOG.md",
					"packages/pi-context/README.md",
					"packages/pi-context/test/foo.test.ts",
					"packages/pi-context/package.json",
				],
				watchFor,
			),
			[],
		);
	});

	it("root *.ts watch matches a root .ts file but not a subdir .ts", () => {
		const rootWatch = (pkg: string): string[] =>
			pkg === "pi-behavior-monitors" ? ["packages/pi-behavior-monitors/*.ts"] : [];
		assert.deepEqual(changedPackages(["packages/pi-behavior-monitors/index.ts"], rootWatch), ["pi-behavior-monitors"]);
		assert.deepEqual(changedPackages(["packages/pi-behavior-monitors/test/x.ts"], rootWatch), []);
	});

	it("knows exactly the seven lockstep packages", () => {
		assert.equal(ALL_PACKAGES.length, 7);
	});
});

describe("unreleasedGrew (decision logic)", () => {
	const before = "# Changelog\n\n## [Unreleased]\n\n## [0.26.0] - 2026-05-25\n- old\n";
	const grown = "# Changelog\n\n## [Unreleased]\n\n### Added\n- a new export\n\n## [0.26.0] - 2026-05-25\n- old\n";

	it("passes a surface change WITH an [Unreleased] line added", () => {
		assert.equal(unreleasedGrew(before, grown), true);
	});

	it("flags a surface change WITHOUT [Unreleased] growth", () => {
		assert.equal(unreleasedGrew(before, before), false);
	});

	it("passes a brand-new CHANGELOG that has an [Unreleased] heading", () => {
		assert.equal(unreleasedGrew(undefined, "# Changelog\n\n## [Unreleased]\n\n- first entry\n"), true);
	});

	it("flags a brand-new CHANGELOG with no [Unreleased] heading", () => {
		assert.equal(unreleasedGrew(undefined, "# Changelog\n\n## [0.1.0] - 2026-01-01\n- x\n"), false);
	});
});

describe("integration: docs-only / changelog-only / package.json-only change sets pass", () => {
	const watchFor = (pkg: string): string[] => (pkg === "pi-context" ? ["packages/pi-context/src/"] : []);

	it("a docs-only change set touches no watched package", () => {
		assert.deepEqual(changedPackages(["packages/pi-context/README.md", "analysis/x.md"], watchFor), []);
	});

	it("a CHANGELOG-only change set touches no watched package", () => {
		assert.deepEqual(changedPackages(["packages/pi-context/CHANGELOG.md"], watchFor), []);
	});

	it("a package.json-only change set touches no watched package", () => {
		assert.deepEqual(changedPackages(["packages/pi-context/package.json"], watchFor), []);
	});

	it("scripts/ + .husky/ + .github/ paths touch no watched package", () => {
		assert.deepEqual(
			changedPackages(["scripts/check-changelog.ts", ".husky/pre-commit", ".github/workflows/ci.yml"], watchFor),
			[],
		);
	});
});
