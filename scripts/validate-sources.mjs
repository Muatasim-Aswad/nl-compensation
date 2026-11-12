import { readdir, readFile } from "node:fs/promises";

const provenance = await readFile("packages/rules-nl/src/provenance/sources.ts", "utf8");
const documentation = await readFile("docs/rules/2026.md", "utf8");
const ruleFiles = (await readdir("packages/rules-nl/src/rules"))
  .filter((name) => name.endsWith("-2026.ts"))
  .sort();

const urls = [...provenance.matchAll(/url: "(https:\/\/[^"]+)"/g)].map((match) => match[1]);
const hashes = [...provenance.matchAll(/contentHash: "sha256:[a-f0-9]{64}"/g)];
if (urls.length < 10 || urls.length !== hashes.length) {
  throw new Error("every official source must have an HTTPS URL and SHA-256 content hash");
}
if (!provenance.includes('const CHECKED_AT = "2026-11-12"')) {
  throw new Error("the source verification date is missing or unexpected");
}
if (ruleFiles.length !== 6)
  throw new Error(`expected six 2026 rule modules, found ${ruleFiles.length}`);
for (const file of ruleFiles) {
  const source = await readFile(`packages/rules-nl/src/rules/${file}`, "utf8");
  if (!source.includes('verifiedAt: "2026-11-12"') || !/-2026-r[1-9][0-9]*"/.test(source)) {
    throw new Error(`${file} does not carry the expected immutable revision and verification date`);
  }
}
for (const required of [
  "nl-payroll-2026-r3",
  "9.860 comparisons",
  "TG 082 - 1Z62FD",
  "rounding",
  "official",
]) {
  if (!documentation.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`docs/rules/2026.md is missing required caveat: ${required}`);
  }
}
process.stdout.write(
  `validated ${urls.length} official sources and ${ruleFiles.length} immutable rules\n`,
);
