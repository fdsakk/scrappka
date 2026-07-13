import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	base: "/app",
	resolve: { tsconfigPaths: true },
	plugins: [
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		tailwindcss(),
		viteReact(),
	],
});

export default config;
