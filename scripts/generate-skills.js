#!/usr/bin/env node

/**
 * Generate SKILL.md files for each package by introspecting the built
 * extensions and reading resource directories.
 *
 * Output format: YAML frontmatter + XML-tagged sections per pi skill standard.
 *
 * Architecture:
 * 1. Import each package's built extension (dist/index.js)
 * 2. Call the factory with a mock `pi` object that captures registrations
 * 3. Read resource directories (agents/, schemas/, workflows/, etc.)
 * 4. Read optional skill-narrative.md (parse + strip YAML frontmatter)
 * 5. Compose SKILL.md from captured metadata + narrative
 * 6. Write full resource listings to references/bundled-resources.md
 *
 * Run after build: npm run build && npm run skills
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, relative, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGES_DIR = join(ROOT, "packages");

// ── Mock pi object ──────────────────────────────────────────────────────────

function createMockPi() {
	const registrations = {
		tools: [],
		commands: [],
		events: [],
		shortcuts: [],
	};

	const mockPi = {
		registerTool(config) {
			registrations.tools.push({
				name: config.name,
				label: config.label,
				description: config.description,
				promptSnippet: config.promptSnippet,
				parameters: extractParameters(config.parameters),
			});
		},
		registerCommand(name, config) {
			registrations.commands.push({
				name,
				description: config.description,
				subcommands: extractSubcommands(config),
			});
		},
		on(event, _handler) {
			registrations.events.push({ event });
		},
		registerShortcut(key, config) {
			registrations.shortcuts.push({
				key: String(key),
				description: config.description,
			});
		},
		sendMessage() {},
		registerMessageRenderer() {},
		registerFlag() {},
		setStatus() {},
	};

	return { mockPi, registrations };
}

// ── TypeBox parameter extraction ────────────────────────────────────────────

function extractParameters(schema) {
	if (!schema || !schema.properties) return [];
	const params = [];
	const required = new Set(schema.required || []);
	for (const [name, prop] of Object.entries(schema.properties)) {
		params.push({
			name,
			type: typeboxToString(prop),
			required: required.has(name),
			description: prop.description || "",
		});
	}
	return params;
}

function typeboxToString(schema) {
	if (!schema) return "unknown";
	const kind = schema[Symbol.for("TypeBox.Kind")] || schema.type;
	switch (kind) {
		case "String":
			return "string";
		case "Number":
			return "number";
		case "Boolean":
			return "boolean";
		case "Object":
			return "object";
		case "Array":
			return "array";
		case "Any":
			return "any";
		case "Unknown":
			return "unknown";
		case "Optional":
			return typeboxToString(schema.anyOf?.[0] || schema) + "?";
		default:
			return schema.type || "unknown";
	}
}

function extractSubcommands(config) {
	// Try to extract from getArgumentCompletions if it returns static values
	if (config.getArgumentCompletions) {
		try {
			const completions = config.getArgumentCompletions("");
			if (Array.isArray(completions)) {
				return completions.map((c) => (typeof c === "string" ? c : c.value));
			}
		} catch {
			/* dynamic completions */
		}
	}
	return [];
}

// ── Resource directory scanning ─────────────────────────────────────────────

function scanResources(packageDir) {
	const resources = [];
	const resourceDirs = ["agents", "schemas", "workflows", "templates", "examples", "defaults"];

	for (const dir of resourceDirs) {
		const fullPath = join(packageDir, dir);
		if (!existsSync(fullPath)) continue;

		const files = listFilesRecursive(fullPath);
		resources.push({
			directory: dir,
			count: files.length,
			files: files.map((f) => relative(packageDir, f)),
		});
	}

	return resources;
}

function listFilesRecursive(dir) {
	const results = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...listFilesRecursive(full));
		} else if (entry.isFile()) {
			results.push(full);
		}
	}
	return results;
}

// ── Narrative frontmatter parsing ───────────────────────────────────────────

/**
 * Parse skill-narrative.md: extract YAML frontmatter (if present) and body.
 * Returns { frontmatter: { name, description, ... } | null, body: string }.
 */
function parseNarrative(content) {
	if (!content.startsWith("---")) {
		return { frontmatter: null, body: content };
	}

	const endIdx = content.indexOf("\n---", 3);
	if (endIdx === -1) {
		return { frontmatter: null, body: content };
	}

	const yamlBlock = content.slice(4, endIdx).trim();
	const body = content.slice(endIdx + 4).trim();

	// Simple YAML parsing for the fields we care about
	const frontmatter = {};
	let currentKey = null;
	let currentValue = "";
	let isMultiline = false;

	for (const line of yamlBlock.split("\n")) {
		const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
		if (keyMatch && !isMultiline) {
			if (currentKey) frontmatter[currentKey] = currentValue.trim();
			currentKey = keyMatch[1];
			const val = keyMatch[2].trim();
			if (val === ">" || val === "|") {
				isMultiline = true;
				currentValue = "";
			} else {
				currentValue = val;
				isMultiline = false;
			}
		} else if (isMultiline && line.match(/^\s/)) {
			currentValue += (currentValue ? " " : "") + line.trim();
		} else if (isMultiline && !line.match(/^\s/) && line.trim()) {
			// End of multiline
			if (currentKey) frontmatter[currentKey] = currentValue.trim();
			const km = line.match(/^(\w[\w-]*):\s*(.*)/);
			if (km) {
				currentKey = km[1];
				currentValue = km[2].trim();
				isMultiline = false;
			}
		}
	}
	if (currentKey) frontmatter[currentKey] = currentValue.trim();

	return { frontmatter, body };
}

// ── Project vocabulary extraction ────────────────────────────────────────────

function extractProjectVocabulary(packageDir) {
	const schemasDir = join(packageDir, "defaults", "schemas");
	if (!existsSync(schemasDir)) return null;

	const schemas = [];
	for (const file of readdirSync(schemasDir).sort()) {
		if (!file.endsWith(".schema.json")) continue;
		const name = file.replace(".schema.json", "");
		try {
			const raw = JSON.parse(readFileSync(join(schemasDir, file), "utf-8"));
			const title = raw.title || name;
			const required = new Set(raw.required || []);
			const properties = [];
			const enums = [];

			if (raw.properties) {
				for (const [propName, propDef] of Object.entries(raw.properties)) {
					const type = Array.isArray(propDef.type) ? propDef.type.join("|") : propDef.type || "unknown";
					properties.push({
						name: propName,
						type,
						required: required.has(propName),
						description: propDef.description || "",
						enum: propDef.enum || null,
					});

					if (type === "array" && propDef.items?.properties) {
						for (const [itemProp, itemDef] of Object.entries(propDef.items.properties)) {
							if (itemDef.enum) {
								enums.push({ block: name, field: itemProp, values: itemDef.enum });
							}
						}
					}

					if (propDef.enum) {
						enums.push({ block: name, field: propName, values: propDef.enum });
					}
				}
			}

			let arrayKey = null;
			const itemProps = [];
			for (const prop of properties) {
				if (prop.type === "array") {
					arrayKey = prop.name;
					const items = raw.properties[prop.name]?.items;
					if (items?.properties) {
						const itemRequired = new Set(items.required || []);
						for (const [iName, iDef] of Object.entries(items.properties)) {
							const iType = Array.isArray(iDef.type) ? iDef.type.join("|") : iDef.type || "unknown";
							const enumSuffix = iDef.enum ? ` (${iDef.enum.join("|")})` : "";
							itemProps.push({
								name: iName,
								type: iType + enumSuffix,
								required: itemRequired.has(iName),
							});
						}
					}
					break;
				}
			}

			schemas.push({ name, title, arrayKey, itemProps, enums });
		} catch {
			/* skip malformed */
		}
	}

	return schemas.length > 0 ? schemas : null;
}

// ── Monitor vocabulary extraction ────────────────────────────────────────────

function extractMonitorVocabulary(mod) {
	if (!mod?.COLLECTOR_DESCRIPTORS) return null;
	return {
		collectors: mod.COLLECTOR_DESCRIPTORS,
		whenConditions: mod.WHEN_CONDITIONS || [],
		verdictTypes: mod.VERDICT_TYPES ? [...mod.VERDICT_TYPES] : [],
		scopeTargets: mod.SCOPE_TARGETS ? [...mod.SCOPE_TARGETS] : [],
		validEvents: mod.VALID_EVENTS ? [...mod.VALID_EVENTS] : [],
	};
}

// ── SKILL.md composition ────────────────────────────────────────────────────

function composeSkill(shortName, packageName, description, registrations, resources, narrativeRaw, vocabulary, monitorVocab) {
	const lines = [];

	// Parse narrative frontmatter
	const { frontmatter: narrativeFm, body: narrativeBody } = narrativeRaw
		? parseNarrative(narrativeRaw)
		: { frontmatter: null, body: null };

	// Use narrative description if available, else package.json description
	const skillDescription = narrativeFm?.description || description;

	// ── YAML frontmatter ──
	lines.push("---");
	lines.push(`name: ${shortName}`);
	// Use block scalar for multi-line descriptions
	if (skillDescription.length > 80 || skillDescription.includes("\n")) {
		lines.push("description: >");
		// Wrap at ~80 chars with 2-space indent
		const words = skillDescription.split(/\s+/);
		let currentLine = "  ";
		for (const word of words) {
			if (currentLine.length + word.length + 1 > 82 && currentLine.trim()) {
				lines.push(currentLine);
				currentLine = "  " + word;
			} else {
				currentLine += (currentLine.trim() ? " " : "") + word;
			}
		}
		if (currentLine.trim()) lines.push(currentLine);
	} else {
		lines.push(`description: "${skillDescription.replace(/"/g, '\\"')}"`);
	}
	lines.push("---");
	lines.push("");

	// ── Tools reference ──
	if (registrations.tools.length > 0) {
		lines.push("<tools_reference>");
		for (const tool of registrations.tools) {
			lines.push(`<tool name="${tool.name}">`);
			lines.push(tool.description);
			if (tool.promptSnippet) {
				lines.push("");
				lines.push(`*${tool.promptSnippet}*`);
			}
			lines.push("");
			if (tool.parameters.length > 0) {
				lines.push("| Parameter | Type | Required | Description |");
				lines.push("|-----------|------|----------|-------------|");
				for (const p of tool.parameters) {
					lines.push(`| \`${p.name}\` | ${p.type} | ${p.required ? "yes" : "no"} | ${p.description} |`);
				}
			}
			lines.push(`</tool>`);
			lines.push("");
		}
		lines.push("</tools_reference>");
		lines.push("");
	}

	// ── Commands reference ──
	if (registrations.commands.length > 0) {
		lines.push("<commands_reference>");
		for (const cmd of registrations.commands) {
			lines.push(`<command name="/${cmd.name}">`);
			lines.push(cmd.description);
			if (cmd.subcommands.length > 0) {
				lines.push("");
				lines.push(`Subcommands: ${cmd.subcommands.map((s) => `\`${s}\``).join(", ")}`);
			}
			lines.push(`</command>`);
			lines.push("");
		}
		lines.push("</commands_reference>");
		lines.push("");
	}

	// ── Keyboard shortcuts ──
	if (registrations.shortcuts.length > 0) {
		lines.push("<keyboard_shortcuts>");
		for (const shortcut of registrations.shortcuts) {
			lines.push(`- **${shortcut.key}** — ${shortcut.description}`);
		}
		lines.push("</keyboard_shortcuts>");
		lines.push("");
	}

	// ── Events ──
	if (registrations.events.length > 0) {
		const uniqueEvents = [...new Set(registrations.events.map((e) => e.event))];
		lines.push("<events>");
		lines.push(uniqueEvents.map((e) => `\`${e}\``).join(", "));
		lines.push("</events>");
		lines.push("");
	}

	// ── Bundled resources (summary only — full listing in reference file) ──
	if (resources.length > 0) {
		lines.push("<bundled_resources>");
		const summaryParts = resources.map((r) => `${r.count} ${r.directory}`);
		lines.push(`${summaryParts.join(", ")} bundled.`);
		lines.push("See references/bundled-resources.md for full inventory.");
		lines.push("</bundled_resources>");
		lines.push("");
	}

	// ── Planning vocabulary (pi-project — from default schemas) ──
	if (vocabulary && vocabulary.length > 0) {
		lines.push("<planning_vocabulary>");
		lines.push("");

		const arraySchemas = vocabulary.filter((s) => s.arrayKey);
		if (arraySchemas.length > 0) {
			lines.push("**Block Types:**");
			lines.push("");
			lines.push("| Block | Title | Array Key | Item Fields |");
			lines.push("|-------|-------|-----------|-------------|");
			for (const s of arraySchemas) {
				const itemFields = s.itemProps
					.map((p) => `${p.name}${p.required ? "" : "?"}` + (p.type !== "string" ? ` (${p.type})` : ""))
					.join(", ");
				lines.push(`| \`${s.name}\` | ${s.title} | \`${s.arrayKey}\` | ${itemFields} |`);
			}
			lines.push("");
		}

		const objectSchemas = vocabulary.filter((s) => !s.arrayKey);
		if (objectSchemas.length > 0) {
			lines.push("**Object Blocks:**");
			for (const s of objectSchemas) {
				lines.push(`- **${s.name}** (${s.title})`);
			}
			lines.push("");
		}

		const allEnums = vocabulary.flatMap((s) => s.enums);
		if (allEnums.length > 0) {
			lines.push("**Status Enums:**");
			lines.push("");
			lines.push("| Block | Field | Values |");
			lines.push("|-------|-------|--------|");
			for (const e of allEnums) {
				lines.push(`| \`${e.block}\` | \`${e.field}\` | ${e.values.join(", ")} |`);
			}
			lines.push("");
		}

		lines.push("</planning_vocabulary>");
		lines.push("");
	}

	// ── Monitor vocabulary (pi-behavior-monitors — from exported registries) ──
	if (monitorVocab) {
		lines.push("<monitor_vocabulary>");
		lines.push("");

		if (monitorVocab.collectors.length > 0) {
			lines.push("**Context Collectors:**");
			lines.push("");
			lines.push("| Collector | Placeholder | Description | Limits |");
			lines.push("|-----------|-------------|-------------|--------|");
			for (const c of monitorVocab.collectors) {
				lines.push(
					`| \`${c.name}\` | \`{${c.name}}\` / \`{{ ${c.name} }}\` | ${c.description} | ${c.limits || "—"} |`,
				);
			}
			lines.push("");
			lines.push(
				"Any string is accepted in `classify.context`. Unknown collector names produce empty string.",
			);
			lines.push("");
			lines.push("Built-in placeholders (always available, not in `classify.context`):");
			lines.push("- `{{ patterns }}` — patterns JSON as numbered list");
			lines.push(
				'- `{{ instructions }}` — instructions JSON as bulleted list with "follow strictly" preamble',
			);
			lines.push("- `{{ iteration }}` — consecutive steer count (0-indexed)");
			lines.push("");
		}

		if (monitorVocab.whenConditions.length > 0) {
			lines.push("**When Conditions:**");
			lines.push("");
			for (const w of monitorVocab.whenConditions) {
				lines.push(`- \`${w.name}\` — ${w.description}`);
			}
			lines.push("");
		}

		if (monitorVocab.validEvents.length > 0) {
			lines.push(`**Events:** ${monitorVocab.validEvents.map((e) => `\`${e}\``).join(", ")}`);
			lines.push("");
		}
		if (monitorVocab.verdictTypes.length > 0) {
			lines.push(`**Verdict Types:** ${monitorVocab.verdictTypes.map((v) => `\`${v}\``).join(", ")}`);
			lines.push("");
		}
		if (monitorVocab.scopeTargets.length > 0) {
			lines.push(`**Scope Targets:** ${monitorVocab.scopeTargets.map((s) => `\`${s}\``).join(", ")}`);
			lines.push("");
		}

		lines.push("</monitor_vocabulary>");
		lines.push("");
	}

	// ── Narrative body (hand-authored, already XML-tagged) ──
	if (narrativeBody) {
		lines.push(narrativeBody);
		lines.push("");
	}

	// ── Footer ──
	lines.push("*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*");
	lines.push("");

	return lines.join("\n");
}

// ── Resource reference file ─────────────────────────────────────────────────

function writeResourceReference(skillDir, resources) {
	if (resources.length === 0) return;

	const refDir = join(skillDir, "references");
	mkdirSync(refDir, { recursive: true });

	const lines = [];
	lines.push("# Bundled Resources");
	lines.push("");

	for (const res of resources) {
		lines.push(`## ${res.directory}/ (${res.count} files)`);
		lines.push("");
		for (const f of res.files) {
			lines.push(`- \`${f}\``);
		}
		lines.push("");
	}

	writeFileSync(join(refDir, "bundled-resources.md"), lines.join("\n"));
}

// ── Per-package generation ──────────────────────────────────────────────────

async function generateForPackage(packageDir) {
	const pkgJsonPath = join(packageDir, "package.json");
	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
	const packageName = pkg.name;
	const description = pkg.description || "";

	console.log(`\nGenerating skill for ${packageName}...`);

	// Import the built extension
	const { mockPi, registrations } = createMockPi();
	const entryPoint = join(packageDir, pkg.main || "dist/index.js");

	if (!existsSync(entryPoint)) {
		console.log(`  Skipping — ${entryPoint} not found (run npm run build first)`);
		return null;
	}

	let mod;
	try {
		mod = await import(entryPoint);
		const factory = mod.default || mod;
		if (typeof factory === "function") {
			factory(mockPi);
		}
	} catch (err) {
		console.log(`  Warning: extension factory threw (expected for extensions needing runtime context): ${err.message}`);
	}

	console.log(`  Tools: ${registrations.tools.length}`);
	console.log(`  Commands: ${registrations.commands.length}`);
	console.log(`  Events: ${registrations.events.length}`);
	console.log(`  Shortcuts: ${registrations.shortcuts.length}`);

	// Scan resources
	const resources = scanResources(packageDir);
	for (const res of resources) {
		console.log(`  ${res.directory}/: ${res.count} files`);
	}

	// Read optional narrative
	const narrativePath = join(packageDir, "skill-narrative.md");
	const narrativeRaw = existsSync(narrativePath) ? readFileSync(narrativePath, "utf-8") : null;

	if (narrativeRaw) {
		console.log(`  Narrative: ${narrativePath}`);
	}

	// Extract project vocabulary (for pi-project only — from defaults/schemas/)
	const vocabulary = extractProjectVocabulary(packageDir);
	if (vocabulary) {
		console.log(`  Vocabulary: ${vocabulary.length} schemas`);
	}

	// Extract monitor vocabulary (for pi-behavior-monitors — from module exports)
	const monitorVocab = extractMonitorVocabulary(mod);
	if (monitorVocab) {
		console.log(`  Monitor vocabulary: ${monitorVocab.collectors.length} collectors, ${monitorVocab.whenConditions.length} conditions`);
	}

	// Compose
	const shortName = packageName.replace("@davidorex/", "");
	const content = composeSkill(shortName, packageName, description, registrations, resources, narrativeRaw, vocabulary, monitorVocab);

	// Write SKILL.md
	const skillDir = join(packageDir, "skills", shortName);
	mkdirSync(skillDir, { recursive: true });
	const skillPath = join(skillDir, "SKILL.md");
	writeFileSync(skillPath, content);
	console.log(`  Wrote ${relative(ROOT, skillPath)}`);

	// Write resource reference file
	writeResourceReference(skillDir, resources);
	if (resources.length > 0) {
		console.log(`  Wrote ${relative(ROOT, join(skillDir, "references", "bundled-resources.md"))}`);
	}

	return { packageName, shortName, description, registrations, resources, skillPath };
}

// ── Meta-package composition ────────────────────────────────────────────────

function generateMetaSkill(subPackageResults) {
	const metaDir = join(PACKAGES_DIR, "pi-project-workflows");
	const metaPkg = JSON.parse(readFileSync(join(metaDir, "package.json"), "utf-8"));
	const shortName = metaPkg.name.replace("@davidorex/", "");

	const lines = [];

	// Frontmatter
	lines.push("---");
	lines.push(`name: ${shortName}`);
	lines.push("description: >");
	lines.push("  Meta-package re-exporting pi-project (schema-driven project state),");
	lines.push("  pi-workflows (workflow orchestration), and pi-behavior-monitors (autonomous");
	lines.push("  behavior monitoring). Install once to get all three extensions.");
	lines.push("---");
	lines.push("");

	lines.push("<objective>");
	lines.push("This meta-package re-exports all three extensions. Install once to get everything:");
	lines.push("");
	lines.push("```");
	lines.push("pi install npm:@davidorex/pi-project-workflows");
	lines.push("```");
	lines.push("</objective>");
	lines.push("");

	lines.push("<included_extensions>");
	for (const result of subPackageResults) {
		if (!result) continue;
		lines.push(`<extension name="${result.packageName}">`);
		lines.push(result.description);
		lines.push("");

		if (result.registrations.tools.length > 0) {
			lines.push(`**Tools:** ${result.registrations.tools.map((t) => `\`${t.name}\``).join(", ")}`);
		}
		if (result.registrations.commands.length > 0) {
			lines.push(`**Commands:** ${result.registrations.commands.map((c) => `\`/${c.name}\``).join(", ")}`);
		}
		if (result.registrations.shortcuts.length > 0) {
			lines.push(
				`**Shortcuts:** ${result.registrations.shortcuts.map((s) => `${s.key} (${s.description})`).join(", ")}`,
			);
		}
		lines.push(`</extension>`);
		lines.push("");
	}
	lines.push("</included_extensions>");
	lines.push("");

	lines.push("*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*");
	lines.push("");

	const skillDir = join(metaDir, "skills", shortName);
	mkdirSync(skillDir, { recursive: true });
	const skillPath = join(skillDir, "SKILL.md");
	writeFileSync(skillPath, lines.join("\n"));
	console.log(`\nMeta-package skill: ${relative(ROOT, skillPath)}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
	console.log("=== Generating SKILL.md files from built extensions ===");

	const packageDirs = ["pi-project", "pi-workflows", "pi-behavior-monitors"];
	const results = [];

	for (const dir of packageDirs) {
		const result = await generateForPackage(join(PACKAGES_DIR, dir));
		results.push(result);
	}

	generateMetaSkill(results);

	console.log("\n=== Done ===");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
