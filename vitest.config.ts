import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    globals: true,
    // The workerd pool runs all workspace package tests except
    // packages/relaton-ts, which is pure Node and runs its own suite.
    include: ["packages/*/test/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
