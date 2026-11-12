import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["scripts/generate-contracts.mjs"], { stdio: "inherit" });
if (!process.env.CI) {
  try {
    const current = execFileSync("git", ["config", "--local", "--get", "core.hooksPath"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (current !== ".githooks")
      console.log(
        `Existing Git hooks preserved (${current}); run pnpm run hooks:install to use this project's checks.`,
      );
  } catch {
    execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"]);
  }
}
