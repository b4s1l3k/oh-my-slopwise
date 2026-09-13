import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "contracts/**/*.test.ts"],
    setupFiles: ["./src/test-utils/setup-database-tests.ts"],
    coverage: {
      provider: "v8",
      include: [
        "contracts/openapi/openapi-test-validator.ts",
        "scripts/golden/**/*.ts",
        "src/app/api/v1/**/route.ts",
        "src/lib/**/*.ts",
        "src/services/**/*.ts",
      ],
      exclude: ["**/*.test.ts"],
      reportOnFailure: true,
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 92,
      },
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
})
