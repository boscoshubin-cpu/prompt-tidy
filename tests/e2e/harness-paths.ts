import { resolve } from "node:path";

export const projectRoot = resolve(import.meta.dirname, "../..");
export const productionExtensionDir = resolve(projectRoot, "extension/dist");
export const testExtensionDir = resolve(projectRoot, "test-results/extension");
export const fixtureMatch = "http://127.0.0.1:4173/*";
