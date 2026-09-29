import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
            // Tests never exercise AI or Vectorize; the real config's AI
      // binding forces a credentialed remote proxy session that CI
      // cannot provide, so tests boot from a trimmed copy.
      wrangler: { configPath: "./wrangler.test.jsonc" },
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
