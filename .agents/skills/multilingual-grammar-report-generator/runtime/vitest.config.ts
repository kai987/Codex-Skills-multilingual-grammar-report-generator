import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@mvl/shared": `${root}packages/shared/src/index.ts`,
      "@mvl/subtitle-core": `${root}packages/subtitle-core/src/index.ts`,
      "@mvl/grammar-report-core": `${root}packages/grammar-report-core/src/index.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
