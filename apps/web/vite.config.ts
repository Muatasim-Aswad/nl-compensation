import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // jsdom owns browser storage; Node Web Storage is process-global.
    execArgv: ["--no-experimental-webstorage"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
