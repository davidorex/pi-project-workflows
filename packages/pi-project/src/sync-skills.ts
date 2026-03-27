/**
 * Sync skill files from a package's skills/ directory to ~/.pi/agent/skills/.
 * Called synchronously from extension factories on activation so skills are
 * available at the canonical user-level location regardless of install method.
 */
import fs from "node:fs";
import path from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

function copyDirRecursive(src: string, dest: string): void {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else if (entry.isFile()) {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

/**
 * Copy all skill directories from a package's skills/ tree into
 * ~/.pi/agent/skills/. Each subdirectory of skills/ becomes a skill.
 *
 * @param distDir - The `import.meta.dirname` of the calling extension
 *                  (resolves to the package's dist/ directory at runtime)
 */
export function syncSkillsToUser(distDir: string): void {
	const sourceSkillsDir = path.resolve(distDir, "..", "skills");
	if (!fs.existsSync(sourceSkillsDir)) return;

	const userSkillsDir = path.join(getAgentDir(), "skills");
	fs.mkdirSync(userSkillsDir, { recursive: true });

	for (const entry of fs.readdirSync(sourceSkillsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		copyDirRecursive(path.join(sourceSkillsDir, entry.name), path.join(userSkillsDir, entry.name));
	}
}
