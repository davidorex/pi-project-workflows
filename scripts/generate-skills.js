#!/usr/bin/env node

/**
 * Generate SKILL.md files for each package by introspecting the built
 * extensions and reading resource directories.
 *
 * Architecture:
 * 1. Import each package's built extension (dist/index.js)
 * 2. Call the factory with a mock `pi` object that captures registrations
 * 3. Read resource directories (agents/, schemas/, workflows/, etc.)
 * 4. Read optional skill-narrative.md for hand-authored behavioral sections
 * 5. Compose SKILL.md from the captured metadata + narrative
 *
 * Run after build: npm run build && npm run skills
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve, dirname, basename, relative } from "path";

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
		case "String": return "string";
		case "Number": return "number";
		case "Boolean": return "boolean";
		case "Object": return "object";
		case "Array": return "array";
		case "Any": return "any";
		case "Unknown": return "unknown";
		case "Optional": return typeboxToString(schema.anyOf?.[0] || schema) + "?";
		default: return schema.type || "unknown";
	}
}

function extractSubcommands(config) {
	// Try to extract from getArgumentCompletions if it returns static values
	if (config.getArgumentCompletions) {
		try {
			const completions = config.getArgumentCompletions("");
			if (Array.isArray(completions)) {
				return completions.map(c => typeof c === "string" ? c : c.value);
			}
		} catch { /* dynamic completions */ }
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
			files: files.map(f => relative(packageDir, f)),
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
					const type = Array.isArray(propDef.type) ? propDef.type.join("|") : (propDef.type || "unknown");
					properties.push({
						name: propName,
						type,
						required: required.has(propName),
						description: propDef.description || "",
						enum: propDef.enum || null,
					});

					// Collect enums from array item properties too
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

			// Extract array key and item properties
			let arrayKey = null;
			let itemProps = [];
			for (const prop of properties) {
				if (prop.type === "array") {
					arrayKey = prop.name;
					const items = raw.properties[prop.name]?.items;
					if (items?.properties) {
						const itemRequired = new Set(items.required || []);
						for (const [iName, iDef] of Object.entries(items.properties)) {
							const iType = Array.isArray(iDef.type) ? iDef.type.join("|") : (iDef.type || "unknown");
							const enumSuffix = iDef.enum ? ` (${iDef.enum.join("|")})` : "";
							itemProps.push({
								name: iName,
								type: iType + enumSuffix,
								required: itemRequired.has(iName),
							});
						}
					}
					break; // first array key only
				}
			}

			schemas.push({ name, title, arrayKey, itemProps, enums });
		} catch { /* skip malformed */ }
	}

	return schemas.length > 0 ? schemas : null;
}

// ── SKILL.md composition ────────────────────────────────────────────────────

function composeSkill(packageName, description, registrations, resources, narrative, vocabulary) {
	const lines = [];

	lines.push(`# ${packageName}`);
	lines.push("");
	lines.push(`> ${description}`);
	lines.push("");

	// Tools
	if (registrations.tools.length > 0) {
		lines.push("## Tools");
		lines.push("");
		for (const tool of registrations.tools) {
			lines.push(`### ${tool.name}`);
			lines.push("");
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
				lines.push("");
			}
		}
	}

	// Commands
	if (registrations.commands.length > 0) {
		lines.push("## Commands");
		lines.push("");
		for (const cmd of registrations.commands) {
			lines.push(`### /${cmd.name}`);
			lines.push("");
			lines.push(cmd.description);
			if (cmd.subcommands.length > 0) {
				lines.push("");
				lines.push(`Subcommands: ${cmd.subcommands.map(s => `\`${s}\``).join(", ")}`);
			}
			lines.push("");
		}
	}

	// Shortcuts
	if (registrations.shortcuts.length > 0) {
		lines.push("## Keyboard Shortcuts");
		lines.push("");
		for (const shortcut of registrations.shortcuts) {
			lines.push(`- **${shortcut.key}** — ${shortcut.description}`);
		}
		lines.push("");
	}

	// Events
	if (registrations.events.length > 0) {
		lines.push("## Events");
		lines.push("");
		const uniqueEvents = [...new Set(registrations.events.map(e => e.event))];
		for (const event of uniqueEvents) {
			lines.push(`- \`${event}\``);
		}
		lines.push("");
	}

	// Resources
	if (resources.length > 0) {
		lines.push("## Bundled Resources");
		lines.push("");
		for (const res of resources) {
			lines.push(`### ${res.directory}/ (${res.count} files)`);
			lines.push("");
			for (const f of res.files) {
				lines.push(`- \`${f}\``);
			}
			lines.push("");
		}
	}

	// Planning vocabulary (for pi-project — derived from default schemas)
	if (vocabulary && vocabulary.length > 0) {
		lines.push("## Planning Vocabulary");
		lines.push("");

		// Block types table
		const arraySchemas = vocabulary.filter((s) => s.arrayKey);
		if (arraySchemas.length > 0) {
			lines.push("### Block Types");
			lines.push("");
			lines.push("| Block | Title | Array Key | Item Fields |");
			lines.push("|-------|-------|-----------|-------------|");
			for (const s of arraySchemas) {
				const itemFields = s.itemProps.map((p) => `${p.name}${p.required ? "" : "?"}` + (p.type !== "string" ? ` (${p.type})` : "")).join(", ");
				lines.push(`| \`${s.name}\` | ${s.title} | \`${s.arrayKey}\` | ${itemFields} |`);
			}
			lines.push("");
		}

		// Single-object schemas
		const objectSchemas = vocabulary.filter((s) => !s.arrayKey);
		if (objectSchemas.length > 0) {
			lines.push("### Object Blocks");
			lines.push("");
			for (const s of objectSchemas) {
				lines.push(`- **${s.name}** (${s.title})`);
			}
			lines.push("");
		}

		// Status enums
		const allEnums = vocabulary.flatMap((s) => s.enums);
		if (allEnums.length > 0) {
			lines.push("### Status Enums");
			lines.push("");
			lines.push("| Block | Field | Values |");
			lines.push("|-------|-------|--------|");
			for (const e of allEnums) {
				lines.push(`| \`${e.block}\` | \`${e.field}\` | ${e.values.join(", ")} |`);
			}
			lines.push("");
		}
	}

	// Narrative (hand-authored behavioral documentation)
	if (narrative) {
		lines.push("---");
		lines.push("");
		lines.push(narrative);
	}

	// Footer
	lines.push("---");
	lines.push("");
	lines.push("*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*");
	lines.push("");

	return lines.join("\n");
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

	try {
		const mod = await import(entryPoint);
		const factory = mod.default || mod;
		if (typeof factory === "function") {
			factory(mockPi);
		}
	} catch (err) {
		console.log(`  Warning: extension factory threw (expected for extensions needing runtime context): ${err.message}`);
		// Registrations captured before the error are still valid —
		// most extensions register tools/commands synchronously before
		// any async operations
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
	const narrative = existsSync(narrativePath)
		? readFileSync(narrativePath, "utf-8")
		: null;

	if (narrative) {
		console.log(`  Narrative: ${narrativePath}`);
	}

	// Extract project vocabulary (for pi-project only — from defaults/schemas/)
	const vocabulary = extractProjectVocabulary(packageDir);
	if (vocabulary) {
		console.log(`  Vocabulary: ${vocabulary.length} schemas`);
	}

	// Compose
	const content = composeSkill(packageName, description, registrations, resources, narrative, vocabulary);

	// Write to skills/<package-short-name>/SKILL.md
	const shortName = packageName.replace("@davidorex/", "");
	const skillDir = join(packageDir, "skills", shortName);
	mkdirSync(skillDir, { recursive: true });
	const skillPath = join(skillDir, "SKILL.md");
	writeFileSync(skillPath, content);
	console.log(`  Wrote ${relative(ROOT, skillPath)}`);

	return { packageName, shortName, description, registrations, resources, skillPath };
}

// ── Meta-package composition ────────────────────────────────────────────────

function generateMetaSkill(subPackageResults) {
	const metaDir = join(PACKAGES_DIR, "pi-project-workflows");
	const metaPkg = JSON.parse(readFileSync(join(metaDir, "package.json"), "utf-8"));

	const lines = [];
	lines.push(`# ${metaPkg.name}`);
	lines.push("");
	lines.push(`> ${metaPkg.description}`);
	lines.push("");
	lines.push("This meta-package re-exports all three extensions. Install once to get everything:");
	lines.push("");
	lines.push("```");
	lines.push("pi install npm:@davidorex/pi-project-workflows");
	lines.push("```");
	lines.push("");
	lines.push("## Included Extensions");
	lines.push("");

	for (const result of subPackageResults) {
		if (!result) continue;
		lines.push(`### ${result.packageName}`);
		lines.push("");
		lines.push(result.description);
		lines.push("");

		if (result.registrations.tools.length > 0) {
			lines.push(`**Tools:** ${result.registrations.tools.map(t => `\`${t.name}\``).join(", ")}`);
		}
		if (result.registrations.commands.length > 0) {
			lines.push(`**Commands:** ${result.registrations.commands.map(c => `\`/${c.name}\``).join(", ")}`);
		}
		if (result.registrations.shortcuts.length > 0) {
			lines.push(`**Shortcuts:** ${result.registrations.shortcuts.map(s => `${s.key} (${s.description})`).join(", ")}`);
		}
		lines.push("");
		lines.push(`See full skill: [${result.shortName}/SKILL.md](../packages/${basename(dirname(result.skillPath))}/../skills/${result.shortName}/SKILL.md)`);
		lines.push("");
	}

	lines.push("---");
	lines.push("");
	lines.push("*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*");
	lines.push("");

	const skillDir = join(metaDir, "skills", "pi-project-workflows");
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
