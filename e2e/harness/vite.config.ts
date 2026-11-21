// Server dei test: l'app vera con lib/local-ledger sostituito dall'archivio simulato.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const mock = fileURLToPath(new URL("./mock-local-ledger.ts", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  oxc: { jsx: { runtime: "automatic" } },
  server: { port: 5198, strictPort: true, fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
  plugins: [{
    name: "e2e-mock-ledger", enforce: "pre",
    resolveId(source, importer) {
      return source === "../lib/local-ledger" && importer?.includes("/src/app/") ? mock : null;
    },
  }],
});
