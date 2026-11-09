import { defineConfig } from "vite";
export default defineConfig({ oxc: { jsx: { runtime: "automatic" } }, build: { outDir: "docs" } });
