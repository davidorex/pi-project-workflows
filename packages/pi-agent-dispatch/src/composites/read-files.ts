/**
 * read-files composite KIND — bounded file read confined to allowed_roots.
 *
 * Instance scope (allowed_roots[]) is fixed at registration time per
 * config.tool_operations[] entry; per-call args carry only the relative
 * path. Refuses any path that, after normalization, falls outside the
 * cartesian union of allowed_roots. Refusal is throw (not return) so
 * callers can't silently degrade into the unrestricted-read shape.
 */

import fs from "node:fs";
import path from "node:path";
import { Type } from "@earendil-works/pi-ai";

export interface ReadFilesInstance {
	allowed_roots: string[];
}

export interface ReadFilesArgs {
	path: string;
}

export interface ReadFilesResult {
	content: string;
}

export const readFilesArgsSchema = Type.Object({
	path: Type.String({ description: "Relative path under one of the instance's allowed_roots." }),
});

export function runReadFiles(cwd: string, instance: ReadFilesInstance, args: ReadFilesArgs): ReadFilesResult {
	if (!instance?.allowed_roots || instance.allowed_roots.length === 0) {
		throw new Error("read-files: instance.allowed_roots is required and must be non-empty.");
	}
	if (!args?.path) {
		throw new Error("read-files: args.path is required.");
	}

	const absTarget = path.resolve(cwd, args.path);
	const allowedAbs = instance.allowed_roots.map((r) => path.resolve(cwd, r));
	const withinAllowed = allowedAbs.some((rootAbs) => {
		const rootWithSep = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
		return absTarget === rootAbs || absTarget.startsWith(rootWithSep);
	});
	if (!withinAllowed) {
		throw new Error(
			`read-files: path '${args.path}' resolves outside allowed_roots [${instance.allowed_roots.join(", ")}].`,
		);
	}

	const content = fs.readFileSync(absTarget, "utf-8");
	return { content };
}
