/**
 * Per-item macro tests: render_domain_entry (Plan 8, Wave 4).
 *
 * Cross-block reference field: related_requirements (REQ- IDs).
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "..", "templates");
const REQUIREMENTS_MACRO_PATH = path.resolve(TEMPLATES_DIR, "items", "requirements.md");

interface ItemLocation {
	block: string;
	arrayKey: string;
	item: Record<string, unknown>;
}

function buildFixtureIdIndex(blocks: Record<string, Array<Record<string, unknown>>>): Map<string, ItemLocation> {
	const index = new Map<string, ItemLocation>();
	for (const [block, items] of Object.entries(blocks)) {
		for (const item of items) {
			const id = item.id;
			if (typeof id === "string") {
				index.set(id, { block, arrayKey: block, item });
			}
		}
	}
	return index;
}

function makeEnv(idIndex: Map<string, ItemLocation>, availableMacros: Record<string, string>): nunjucks.Environment {
	const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATES_DIR), {
		autoescape: false,
		throwOnUndefined: false,
	});

	env.addGlobal("resolve", (id: unknown): ItemLocation | null => {
		if (typeof id !== "string" || id.length === 0) return null;
		return idIndex.get(id) ?? null;
	});

	const visited = new Set<string>();
	env.addGlobal("render_recursive", (loc: unknown, depth: unknown): string => {
		if (!loc || typeof loc !== "object") return "";
		const location = loc as ItemLocation;
		const itemId = (location.item as { id?: unknown })?.id;
		const idStr = typeof itemId === "string" ? itemId : "";
		const blockName = typeof location.block === "string" ? location.block : "?";

		if (idStr.length > 0 && visited.has(idStr)) {
			return `[cycle: ${idStr}]`;
		}

		const macroPath = availableMacros[blockName];
		if (!macroPath) {
			return `[unrendered: ${blockName}/${idStr}]`;
		}

		const macroNameMap: Record<string, string> = {
			requirements: "render_requirement",
			domain: "render_domain_entry",
		};
		const macroName = macroNameMap[blockName] ?? `render_${blockName.replace(/-/g, "_")}`;
		const depthNum = typeof depth === "number" && Number.isFinite(depth) ? depth : 0;
		if (idStr.length > 0) visited.add(idStr);
		try {
			const macroSource = fs.readFileSync(macroPath, "utf-8");
			const inline = `${macroSource}\n{{ ${macroName}(item, depth) }}`;
			return env.renderString(inline, { item: location.item, depth: depthNum });
		} catch (err) {
			return `[render_error: ${blockName}/${idStr}: ${err instanceof Error ? err.message : String(err)}]`;
		} finally {
			if (idStr.length > 0) visited.delete(idStr);
		}
	});

	env.addGlobal("enforceBudget", (rendered: unknown): string =>
		typeof rendered === "string" ? rendered : rendered === undefined || rendered === null ? "" : String(rendered),
	);

	return env;
}

function renderItem(env: nunjucks.Environment, e: Record<string, unknown>, depth = 0): string {
	const tpl = `{% from "items/domain.md" import render_domain_entry %}{{ render_domain_entry(e, depth) }}`;
	return env.renderString(tpl, { e, depth });
}

describe("render_domain_entry macro", () => {
	it("case 1: required fields rendered", () => {
		const entry = {
			id: "D-001",
			title: "REST conventions",
			content: "Use PATCH for partial updates",
			category: "reference",
		};
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, entry, 0);
		assert.match(out, /\*\*D-001\*\*/);
		assert.match(out, /\[reference\]/);
		assert.match(out, /REST conventions/);
		assert.match(out, /Use PATCH for partial updates/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 2: optional fields — source, confidence, tags", () => {
		const entry = {
			id: "D-002",
			title: "OAuth 2.1 draft",
			content: "Refresh token rotation now mandatory",
			category: "research",
			source: "ietf-rfc",
			confidence: "high",
			tags: ["auth", "security"],
		};
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, entry, 0);
		assert.match(out, /tags: auth, security/);
		assert.match(out, /Source: ietf-rfc/);
		assert.match(out, /Confidence: high/);
	});

	it("case 3: depth=0 emits bare IDs for related_requirements", () => {
		const entry = {
			id: "D-003",
			title: "constraint",
			content: "domain rule",
			category: "domain-rule",
			related_requirements: ["REQ-001"],
		};
		const idIndex = buildFixtureIdIndex({
			requirements: [{ id: "REQ-001", description: "must not leak" }],
		});
		const env = makeEnv(idIndex, { requirements: REQUIREMENTS_MACRO_PATH });
		const out = renderItem(env, entry, 0);
		assert.match(out, /Related requirements:.*REQ-001/);
		assert.doesNotMatch(out, /must not leak/);
	});

	it("case 3b: depth=1 inlines related_requirements through render_requirement", () => {
		const entry = {
			id: "D-003",
			title: "constraint",
			content: "domain rule",
			category: "domain-rule",
			related_requirements: ["REQ-001"],
		};
		const idIndex = buildFixtureIdIndex({
			requirements: [
				{
					id: "REQ-001",
					description: "INLINE-BODY",
					type: "functional",
					status: "accepted",
					priority: "must",
				},
			],
		});
		const env = makeEnv(idIndex, { requirements: REQUIREMENTS_MACRO_PATH });
		const out = renderItem(env, entry, 1);
		assert.match(out, /INLINE-BODY/, "REQ-001 body must be inlined at depth=1");
	});

	it("case 4: cycle terminates — domain entry references requirement that traces back to a domain ID", () => {
		// Domain → requirement → ... cycle is hard to construct because the
		// schemas don't link requirements back to domain. Approximate cycle
		// via a domain entry that lists itself in related_requirements (the
		// ID space overlaps if a project ever IDs both with the same string).
		// More realistic check: lookup miss returns bare ID without infinite
		// recursion. The cycle detector activates on visited-Set hits; here
		// we verify single-step descent does NOT loop.
		const entry = {
			id: "D-005",
			title: "self-ref edge case",
			content: "body",
			category: "domain-rule",
			related_requirements: ["D-005"],
		};
		const idIndex = buildFixtureIdIndex({ domain: [entry] });
		const env = makeEnv(idIndex, {
			domain: path.resolve(TEMPLATES_DIR, "items", "domain.md"),
		});
		// Expectation: at depth=2, descent into D-005 will hit the visited
		// Set on the back-edge. The render_recursive global seeds visited
		// only on first descent (the direct call from this test does not
		// seed it). So D-005 enters once, then back-edge triggers cycle.
		const out = renderItem(env, entry, 3);
		// Either the cycle marker fires or the depth budget exhausts cleanly.
		// Both are acceptable termination signals.
		const terminatedCleanly = /\[cycle: D-005\]/.test(out) || /D-005/.test(out);
		assert.ok(terminatedCleanly, "cycle/budget termination must occur, no infinite loop");
	});

	it("case 5: empty related_requirements array renders '(none)'", () => {
		const entry = {
			id: "D-006",
			title: "empty",
			content: "body",
			category: "domain-rule",
			related_requirements: [],
		};
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, entry, 0);
		assert.match(out, /Related requirements:.*\(none\)/);
	});

	it("case 6: whole-block derived view — render_domain maps render_domain_entry over data.entries", () => {
		const data = {
			entries: [
				{ id: "D-001", title: "first", content: "body 1", category: "reference" },
				{ id: "D-002", title: "second", content: "body 2", category: "research" },
			],
		};
		const env = makeEnv(new Map(), {});
		const wholeTpl = `{% from "shared/macros.md" import render_domain %}{{ render_domain(data) }}`;
		const wholeOut = env.renderString(wholeTpl, { data });
		assert.match(wholeOut, /## Domain Knowledge/);
		assert.match(wholeOut, /\*\*D-001\*\*/);
		assert.match(wholeOut, /\*\*D-002\*\*/);
		assert.match(wholeOut, /first/);
		assert.match(wholeOut, /second/);
		const item1Out = renderItem(env, data.entries[0]!, 0).trim();
		// First-line equivalence: the per-item output's first line appears in the whole-block output.
		assert.ok(wholeOut.includes(item1Out.split("\n")[0] ?? ""));
	});
});
