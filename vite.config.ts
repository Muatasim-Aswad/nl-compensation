import { defineConfig } from "vite-plus";

export default defineConfig({
  // Source-only discovery prevents TypeScript build output from being tested a
  // second time when package commands are run after a build.
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  fmt: {
    proseWrap: "never",
  },
  run: {
    tasks: {
      contracts: { command: "node scripts/generate-contracts.mjs", cache: false },
      architecture: { command: "node scripts/check-architecture.mjs" },
      "fmt:check": { command: "vp fmt --check" },
      lint: { command: "vp lint --deny-warnings" },
      typecheck: { command: "vp run -r --cache typecheck" },
      test: { command: "vp run -r --cache test" },
      build: { command: "vp run -r --cache build", dependsOn: ["contracts"] },
      verify: {
        command: [
          "vp run contracts",
          "vp run architecture",
          "vp run fmt:check",
          "vp run lint",
          "vp run typecheck",
          "vp run test",
        ],
      },
    },
  },
});
