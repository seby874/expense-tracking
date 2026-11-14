import { defineConfig } from "vite";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  build: {
    outDir: "docs",
    chunkSizeWarningLimit: 700, // il file firebase è grande di suo (~640 KB, ~190 KB compresso)
    rolldownOptions: {
      output: {
        // Le librerie finiscono in file separati (firebase, react, altre) il cui nome dipende
        // solo dal loro contenuto: finché non aggiorni le dipendenze restano identici. A ogni
        // pubblicazione cambia solo il file dell'app: il browser riscarica pochi KB e il
        // repository GitHub cresce di poco.
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
