import { defineConfig } from "vite";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  build: {
    outDir: "docs",
    // Il lettore dei PDF (pdf.js) si carica solo quando serve: è grande, ma non pesa sull'avvio dell'app.
    chunkSizeWarningLimit: 1400,
    rolldownOptions: {
      output: {
        // Il worker di pdf.js esce come .js: ogni hosting lo serve con il tipo giusto.
        assetFileNames: (asset) => (asset.names?.[0]?.endsWith(".mjs") ? "assets/[name]-[hash].js" : "assets/[name]-[hash][extname]"),
      },
    },
  },
});
