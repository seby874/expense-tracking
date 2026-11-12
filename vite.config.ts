import { defineConfig } from "vite";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  build: {
    outDir: "docs",
    // Il lettore dei PDF (pdf.js) si carica solo quando serve: è grande, ma non pesa sull'avvio dell'app.
    chunkSizeWarningLimit: 1400,
    rolldownOptions: {
      output: {
        // Le librerie finiscono in file separati (firebase, react, altre) il cui nome dipende
        // solo dal loro contenuto: finché non aggiorni le dipendenze restano identici. A ogni
        // pubblicazione cambia solo il file dell'app: il browser riscarica pochi KB e il
        // repository GitHub cresce di poco. pdf.js resta fuori: si carica solo quando serve.
        codeSplitting: {
          groups: [
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase|@grpc|idb|tslib)[\\/]/, priority: 3 },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: "vendor", test: /node_modules[\\/](?!pdfjs-dist[\\/])/, priority: 1 },
          ],
        },
        // Il worker di pdf.js esce come .js: ogni hosting lo serve con il tipo giusto.
        assetFileNames: (asset) => (asset.names?.[0]?.endsWith(".mjs") ? "assets/[name]-[hash].js" : "assets/[name]-[hash][extname]"),
      },
    },
  },
});
