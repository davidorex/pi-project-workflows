/**
 * Runtime demo (final step of the template-relocation work that moved the
 * canonical templates into pi-jit-agents):
 *
 * Exercises the canonical Nunjucks render path against the 6 newly-added
 * whole-block delegators via createTemplateEnv (3-tier template search) rooted
 * at the new pi-jit-agents canonical template directory. Reads real `.project/`
 * substrate via pi-context block-api `readBlock`; feeds each block payload as
 * the named template variable (e.g. `_decisions`) the new delegators consume.
 *
 * No LLM call. No pi-ai dependency. Render-only path is sufficient to validate
 * that the 6 missing delegators are now reachable through the 3-tier template
 * search rooted at packages/pi-jit-agents/templates/.
 *
 * Captures the rendered output to /tmp/runtime-demo-6-delegators.md.
 */

import * as fs from "node:fs";
import { readBlock } from "@davidorex/pi-context/block-api";
import { registerCompositionGlobals } from "@davidorex/pi-jit-agents/compile";
import { bundledTemplateDir, createTemplateEnv } from "@davidorex/pi-jit-agents/template";

const cwd = process.cwd();
const builtinDir = bundledTemplateDir();

console.log(`[runtime-demo] pi-jit-agents bundledTemplateDir() → ${builtinDir}`);
if (!fs.existsSync(builtinDir)) {
	throw new Error(`bundledTemplateDir() returned non-existent path: ${builtinDir}`);
}
const sharedMacrosPath = `${builtinDir}/shared/macros.md`;
if (!fs.existsSync(sharedMacrosPath)) {
	throw new Error(`shared/macros.md not found at ${sharedMacrosPath} — template tree relocation broken`);
}

const env = createTemplateEnv({ cwd, builtinDir });
registerCompositionGlobals({
	env,
	cwd,
	rendererRegistry: undefined,
	getIdIndex: () => new Map(),
	warningsCollector: [],
});
console.log(`[runtime-demo] createTemplateEnv + registerCompositionGlobals → enforceBudget global wired`);

// Read real substrate via canonical block-api.
const decisions = readBlock(cwd, "decisions");
const features = readBlock(cwd, "features");
const frameworkGaps = readBlock(cwd, "framework-gaps");
const layerPlans = readBlock(cwd, "layer-plans");
const research = readBlock(cwd, "research");
const specReviews = readBlock(cwd, "spec-reviews");

const promptTemplate = `Runtime demo — render 6 newly-added whole-block delegators against real .project/ substrate.

{% from "shared/macros.md" import render_decisions, render_features, render_framework_gaps, render_layer_plans, render_research, render_spec_reviews %}

{{ render_decisions(_decisions) }}
{{ render_features(_features) }}
{{ render_framework_gaps(_framework_gaps) }}
{{ render_layer_plans(_layer_plans) }}
{{ render_research(_research) }}
{{ render_spec_reviews(_spec_reviews) }}
`;

const rendered = env.renderString(promptTemplate, {
	_decisions: decisions,
	_features: features,
	_framework_gaps: frameworkGaps,
	_layer_plans: layerPlans,
	_research: research,
	_spec_reviews: specReviews,
});

fs.writeFileSync("/tmp/runtime-demo-6-delegators.md", rendered, "utf-8");
console.log(`[runtime-demo] rendered → /tmp/runtime-demo-6-delegators.md (${rendered.length} chars)`);

// Lens-4-style assertions per plan adversarial-probe lens model.
const expectedHeaders: Array<{ kind: string; displayName: string; idPrefix: string }> = [
	{ kind: "decisions", displayName: "Decisions", idPrefix: "DEC-" },
	{ kind: "features", displayName: "Features", idPrefix: "FEAT-" },
	{ kind: "framework-gaps", displayName: "Framework Gaps", idPrefix: "FGAP-" },
	{ kind: "layer-plans", displayName: "Layer Restructure Plans", idPrefix: "PLAN-" },
	{ kind: "research", displayName: "Research", idPrefix: "R-" },
	{ kind: "spec-reviews", displayName: "Spec Reviews", idPrefix: "REVIEW-" },
];

const failures: string[] = [];
for (const { kind, displayName, idPrefix } of expectedHeaders) {
	const headerOk = rendered.includes(`## ${displayName}`);
	const idOk = new RegExp(`${idPrefix}\\d`).test(rendered);
	if (!headerOk) failures.push(`${kind}: missing "## ${displayName}" header`);
	if (!idOk) failures.push(`${kind}: no "${idPrefix}<digit>" id substring found`);
}

// Nunjucks-failure markers — narrowed regex per plan Lens 4 to avoid tripping
// on legitimate item content (e.g. type annotations like `Model<any> | undefined`).
const nunjucksFailures = [
	{ name: "trailing-undefined-value", re: /:\s*undefined\s*$/m },
	{ name: "bare-undefined-list-item", re: /^-\s*undefined\s*$/m },
	{ name: "bare-undefined-line", re: /^undefined\s*$/m },
	{ name: "object-Object-leak", re: /\[object Object\]/ },
];
for (const { name, re } of nunjucksFailures) {
	if (re.test(rendered)) failures.push(`nunjucks-failure pattern "${name}" matched: ${re}`);
}

if (failures.length > 0) {
	console.error("\n[runtime-demo] FAILURES:");
	for (const f of failures) console.error(`  ✗ ${f}`);
	process.exit(1);
}

console.log(`\n[runtime-demo] ✔ all 6 delegators emitted display-name header + at least one item id`);
console.log(`[runtime-demo] ✔ no Nunjucks failure markers detected`);
console.log(`[runtime-demo] ✔ 3-tier template search resolved through pi-jit-agents canonical root`);
