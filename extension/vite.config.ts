import { copyFile, mkdir } from "node:fs/promises";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    lib: {
      entry: "src/content/index.tsx",
      formats: ["iife"],
      name: "PromptTidyContent",
      fileName: () => "content.js"
    },
    rollupOptions: { output: { inlineDynamicImports: true } }
  },
  plugins: [{
    name: "copy-manifest",
    async closeBundle() {
      await mkdir("dist", { recursive: true });
      await copyFile("manifest.json", "dist/manifest.json");
    }
  }]
});
