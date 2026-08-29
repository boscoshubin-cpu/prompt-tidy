import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist",
    rollupOptions: {
      input: "popup.html",
      output: {
        entryFileNames: "popup.js"
      }
    }
  }
});
