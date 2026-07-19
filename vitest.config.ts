import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  // The routes deliberately exercise OPENAI_API_KEY fallbacks; keep those
  // environment-sensitive tests deterministic instead of racing across files.
  test: { environment: "node", include: ["tests/**/*.test.ts"], maxWorkers: 1 },
});
