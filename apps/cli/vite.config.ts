import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  ssr: { noExternal: true },
  build: {
    ssr: "src/entrypoints/cli.ts",
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
      },
    },
  },
});
