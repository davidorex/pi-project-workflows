// Minimal stub — satisfies `import { complete } from "@mariozechner/pi-ai"`
// and the type-only imports used in index.ts.  No runtime behaviour needed;
// tests never call into the real pi-ai SDK.

export function complete() {
	throw new Error("pi-ai stub: complete() should not be called in tests");
}
