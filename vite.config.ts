import { readdirSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";

const extensionScriptNames = new Set(["background", "content"]);

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        background: "src/background.ts",
        content: "src/content.ts",
        dashboard: "src/dashboard.html",
        options: "src/options.html",
        panel: "src/panel.html",
        devtools: "src/devtools.html"
      },
      output: {
        entryFileNames: (chunk) =>
          extensionScriptNames.has(chunk.name)
            ? "src/[name].js"
            : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  plugins: [
    {
      name: "copy-extension-assets",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: readFileSync("manifest.json", "utf8")
        });

        for (const fileName of readdirSync("icons")) {
          if (!fileName.endsWith(".png")) continue;
          this.emitFile({
            type: "asset",
            fileName: `icons/${fileName}`,
            source: readFileSync(`icons/${fileName}`)
          });
        }
      }
    }
  ]
});
