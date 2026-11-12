import { defineConfig } from "vite";

// Le librerie finiscono in file separati (firebase, react, altre) il cui nome
// dipende solo dal loro contenuto: finché non aggiorni le dipendenze restano
// identici. Così a ogni pubblicazione cambia solo il piccolo file dell'app:
// il browser riscarica pochi KB e il repository GitHub cresce di poco
// (git non salva due volte un file identico).
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  build: {
    outDir: "docs",
    chunkSizeWarningLimit: 700, // il file firebase è grande di suo (~640 KB, ~190 KB compresso)
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase|@grpc|idb|tslib)[\\/]/, priority: 3 },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: "vendor", test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
