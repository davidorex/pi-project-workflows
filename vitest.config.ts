import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// index.ts imports pi runtime packages that are not installed in dev.
		// Tests only exercise pure exported functions, so we alias the pi
		// packages to lightweight stubs that satisfy the import resolver.
		alias: {
			"@mariozechner/pi-ai": new URL("./test/stubs/pi-ai.ts", import.meta.url).pathname,
			"@mariozechner/pi-coding-agent": new URL("./test/stubs/pi-coding-agent.ts", import.meta.url).pathname,
			"@mariozechner/pi-tui": new URL("./test/stubs/pi-tui.ts", import.meta.url).pathname,
		},
	},
});
