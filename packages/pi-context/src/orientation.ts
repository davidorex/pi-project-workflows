/**
 * Eager framework guidance for the in-pi LLM (FGAP-090 / TASK-074).
 *
 * The constrained in-pi agent receives no framework orientation today — it
 * operates from tool descriptions alone. This module supplies two pure
 * surfaces consumed by the pi-context extension's 0.75.4 hooks:
 *
 * - `buildOrientationBlock()` — a static topic→TOOL-CALL map appended to the
 *   agent's system prompt via `before_agent_start`. The in-pi agent has NO
 *   `read` tool, so guidance routes to TOOLS (queryable), never file paths.
 * - `skillsDir()` — the absolute path to the packaged pi-context skill dir,
 *   surfaced via `resources_discover`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve relative to THIS module. `import.meta.dirname` is latent-broken
// under tsx-CJS in this repo; use fileURLToPath + path.dirname instead.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Static orientation block — pure, no I/O, no substrate read. Maps common
 * operating topics to the tool calls that answer them, with a grounding
 * directive against confabulating canonical names / schemas / signatures.
 */
export function buildOrientationBlock(): string {
	return `## pi-context: how to operate this project's substrate

This project's state lives in a typed substrate you operate via tools — not files you read. Query before you assert; never invent canonical names, schemas, or tool signatures — they are all queryable.

- Vocabulary (block kinds, relation_types, lenses, layers): call \`read-config\` (this project's authoritative registry) or \`read-samples-catalog\` (the installable catalog).
- A block kind's schema (fields, id pattern, required): call \`read-schema\`.
- The tools available to you and their parameters: call \`list-tools\` — do not guess a tool name or signature.
- Read substrate items: \`read-block\` / \`read-block-item\` / \`read-block-page\`; resolve an id: \`resolve-item-by-id\`.
- Add a block kind: \`read-samples-catalog\` (see the shape), then \`write-schema\` (define) + \`amend-config\` (register). Add a relationship: \`append-relation\` (relations are edges, never FK fields). Change config: \`amend-config\`.
- Bootstrap / onboarding: run \`/context init <substrate-dir>\` (suggested \`.context\`), then \`/context accept-all\`, then \`/context install\`.

Grounding: vocabulary and tool signatures are always queryable via the tools above. If you are unsure of a canonical name, schema, or parameter, call the relevant tool — do not confabulate.`;
}

/**
 * Absolute path to the packaged pi-context skill directory.
 *
 * Resolved relative to this module. The built module lives at
 * `dist/orientation.js`, so `..` from `moduleDir` is the package root and
 * `../skills/pi-context` is correct for both the `src/` (tsx) and `dist/`
 * (built — the layout pi loads) locations.
 */
export function skillsDir(): string {
	return path.resolve(moduleDir, "..", "skills", "pi-context");
}
