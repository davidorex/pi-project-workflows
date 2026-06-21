/**
 * generate-signatures.ts
 *
 * Extracts type signatures and JSDoc from TypeScript source files.
 * Output goes to .pi/signatures/<pkg>/<file>.sig.md
 *
 * Run standalone:  npx tsx scripts/generate-signatures.ts
 * Run post-build:   add to package.json build script after tsc
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SIG_DIR = ".pi/signatures";

// ── Types ────────────────────────────────────────────────────────────────────

interface SignatureEntry {
	name: string;
	signature: string;
	jsdoc: string;
	startLine: number;
}

interface FileSignatures {
	file: string;
	entries: SignatureEntry[];
}

// ── JSDoc extraction ──────────────────────────────────────────────────────────

function getJSDoc(node: ts.Node, sourceFile: ts.SourceFile): string {
	const fullText = sourceFile.getFullText();

	// Get the leading JSDoc comment
	const ranges = ts.getLeadingCommentRanges(fullText, node.pos);
	if (!ranges || ranges.length === 0) return "";

	const jsdocRange = ranges.find((r) => r.kind === ts.SyntaxKind.MultiLineCommentTrivia);
	if (!jsdocRange) return "";

	let comment = fullText
		.substring(jsdocRange.pos + 3, jsdocRange.end - 2) // strip /** and */
		.replace(/\n\s*\*/g, " ") // strip leading * on each line
		.replace(/\n+/g, " ")
		.trim();

	// Extract @param, @returns, @throws tags
	const tagMatches = comment.match(/@[a-z]+/gi) ?? [];
	const tags = [...new Set(tagMatches.map((t) => t.toLowerCase()))].join(" ");
	if (tags) {
		comment = comment ? `${comment} ${tags}` : tags;
	}

	return comment.replace(/\s+/g, " ").trim();
}

// ── Text-based signature extraction ──────────────────────────────────────────

function printSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
	const fullText = sourceFile.getFullText();
	const start = node.getStart();
	const end = node.getEnd();
	let text = fullText.substring(start, end);

	// Collapse multiline signatures to single line for summary view
	text = text.replace(/\s+/g, " ").replace(/\{\s+/g, " {").replace(/\}\s+/g, " }").trim();

	// Truncate if too long
	if (text.length > 200) {
		const braceEnd = text.indexOf(") {");
		if (braceEnd > 0) {
			text = `${text.substring(0, braceEnd + 2)} ... }`;
		} else {
			text = `${text.substring(0, 200)} ...`;
		}
	}

	return text;
}

// ── Signature extraction ──────────────────────────────────────────────────────

function extractSignatures(sourceFile: ts.SourceFile): FileSignatures {
	const entries: SignatureEntry[] = [];

	const visit = (node: ts.Node) => {
		if (ts.isFunctionDeclaration(node)) {
			const name = node.name?.text ?? "<anonymous>";
			const modifiers = ts.getModifiers(node) ?? [];
			const isExported = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (isExported || name !== "<anonymous>") {
				entries.push({
					name,
					signature: printSignature(node, sourceFile),
					jsdoc: getJSDoc(node, sourceFile),
					startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
				});
			}
		} else if (ts.isInterfaceDeclaration(node)) {
			entries.push({
				name: node.name.text,
				signature: printSignature(node, sourceFile),
				jsdoc: getJSDoc(node, sourceFile),
				startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			});
		} else if (ts.isTypeAliasDeclaration(node)) {
			entries.push({
				name: node.name.text,
				signature: printSignature(node, sourceFile),
				jsdoc: getJSDoc(node, sourceFile),
				startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			});
		} else if (ts.isClassDeclaration(node)) {
			entries.push({
				name: node.name?.text ?? "<anonymous>",
				signature: printSignature(node, sourceFile),
				jsdoc: getJSDoc(node, sourceFile),
				startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			});
		} else if (ts.isEnumDeclaration(node)) {
			entries.push({
				name: node.name.text,
				signature: printSignature(node, sourceFile),
				jsdoc: getJSDoc(node, sourceFile),
				startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			});
		} else if (ts.isVariableStatement(node)) {
			const modifiers = ts.getModifiers(node) ?? [];
			const isExported = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (isExported) {
				for (const decl of node.declarationList.declarations) {
					if (ts.isIdentifier(decl.name)) {
						entries.push({
							name: decl.name.text,
							signature: printSignature(decl, sourceFile),
							jsdoc: getJSDoc(node, sourceFile),
							startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
						});
					}
				}
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return { file: sourceFile.fileName, entries };
}

// ── Markdown rendering ───────────────────────────────────────────────────────

function renderToMarkdown(relPath: string, sigs: FileSignatures): string {
	const lines: string[] = [`## ${relPath}`, ""];

	const byCategory = {
		function: sigs.entries.filter((e) => e.signature.includes("function")),
		interface: sigs.entries.filter((e) => e.signature.startsWith("interface")),
		type: sigs.entries.filter((e) => e.signature.startsWith("type")),
		class: sigs.entries.filter((e) => e.signature.startsWith("class")),
		enum: sigs.entries.filter((e) => e.signature.startsWith("enum")),
		variable: sigs.entries.filter(
			(e) =>
				!e.signature.includes("function") &&
				!e.signature.startsWith("interface") &&
				!e.signature.startsWith("type") &&
				!e.signature.startsWith("class") &&
				!e.signature.startsWith("enum"),
		),
	};

	const categories = [
		{ label: "### Functions", key: "function" as const },
		{ label: "### Interfaces", key: "interface" as const },
		{ label: "### Types", key: "type" as const },
		{ label: "### Classes", key: "class" as const },
		{ label: "### Enums", key: "enum" as const },
		{ label: "### Variables & Constants", key: "variable" as const },
	];

	for (const cat of categories) {
		const items = byCategory[cat.key];
		if (items.length === 0) continue;
		lines.push(cat.label);
		for (const entry of items) {
			lines.push(`- **${entry.name}**${entry.jsdoc ? ` — ${entry.jsdoc}` : ""}`);
			lines.push("  ```typescript");
			lines.push(`  ${entry.signature}`);
			lines.push("  ```");
		}
		lines.push("");
	}

	return lines.join("\n");
}

// ── File walking ─────────────────────────────────────────────────────────────

function _findTsFiles(dir: string, relativeRoot: string): string[] {
	const results: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "test") continue;
			results.push(..._findTsFiles(full, relativeRoot));
		} else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
			const rel = path.relative(relativeRoot, full);
			results.push(rel);
		}
	}
	return results;
}

// ── Program setup ────────────────────────────────────────────────────────────

function getProjectPaths(pkgDir: string): string[] {
	const configPath = ts.findConfigFile(pkgDir, ts.sys.fileExists, "tsconfig.json");
	if (!configPath) {
		console.warn(`No tsconfig.json found in ${pkgDir}, skipping`);
		return [];
	}
	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
	return parsed.fileNames.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
	const packagesDir = path.resolve("packages");
	if (!fs.existsSync(packagesDir)) {
		console.error("No packages/ directory found");
		process.exit(1);
	}

	const packages = fs.readdirSync(packagesDir).filter((p) => {
		const srcDir = path.join(packagesDir, p, "src");
		return fs.existsSync(srcDir);
	});

	let totalFiles = 0;
	let totalEntries = 0;

	for (const pkg of packages) {
		const pkgDir = path.join(packagesDir, pkg);
		const _srcDir = path.join(pkgDir, "src");
		const outDir = path.join(SIG_DIR, pkg);
		fs.mkdirSync(outDir, { recursive: true });

		// Use project's tsconfig for correct path resolution
		const filePaths = getProjectPaths(pkgDir);
		const _relativeFiles = filePaths.map((f) => path.relative(pkgDir, f));

		let pkgFiles = 0;
		let pkgEntries = 0;

		for (const filePath of filePaths) {
			const relPath = path.relative(pkgDir, filePath);
			const sourceFile = ts.createSourceFile(
				filePath,
				fs.readFileSync(filePath, "utf-8"),
				ts.ScriptTarget.Latest,
				true,
			);
			const sigs = extractSignatures(sourceFile);

			if (sigs.entries.length === 0) continue;

			const sigFileName = relPath.replace(/\.ts$/, ".sig.md").replace(/[\\/]/g, "-");
			const outPath = path.join(outDir, sigFileName);
			const md = renderToMarkdown(path.join(pkg, relPath), sigs);
			fs.writeFileSync(outPath, md, "utf-8");

			pkgFiles++;
			pkgEntries += sigs.entries.length;
		}

		if (pkgFiles > 0) {
			console.log(`✓ ${pkg}: ${pkgFiles} files, ${pkgEntries} entries`);
		}
		totalFiles += pkgFiles;
		totalEntries += pkgEntries;
	}

	console.log(`\nDone: ${totalFiles} files, ${totalEntries} signatures → ${SIG_DIR}/`);
}

main();
