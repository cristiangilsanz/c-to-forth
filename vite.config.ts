import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
