import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Only this project's own suites — never the vendored whisper.cpp specs.
		include: ["tests/**/*.test.ts"],
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"whisper.cpp/**",
			"**/whisper.cpp/**",
		],
	},
});
