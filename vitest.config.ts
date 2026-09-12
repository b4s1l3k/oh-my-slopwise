import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test-utils/setup-database-tests.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
})
