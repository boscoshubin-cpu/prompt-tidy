import { copyFile, mkdir } from "node:fs/promises";
import preact from "@preact/preset-vite";
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
    }
  },
  plugins: [
    preact(),
    {
      name: "copy-manifest",
      async closeBundle() {
        await mkdir("dist", { recursive: true });
        await copyFile("manifest.json", "dist/manifest.json");
      }
    }
  ]
});
