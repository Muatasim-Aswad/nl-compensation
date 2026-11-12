import ts from "typescript";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "generated",
      )
      .map((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) ? [file] : [];
      }),
  );
  return nested.flat();
}
const owners = ["apps/cli", "apps/web", "packages/core", "packages/rules-nl"];
const manifests = new Map(
  await Promise.all(
    owners.map(async (owner) => [
      owner,
      JSON.parse(await readFile(`${owner}/package.json`, "utf8")),
    ]),
  ),
);
const packageOwners = new Map([...manifests].map(([owner, manifest]) => [manifest.name, owner]));
const files = (await Promise.all(owners.map((owner) => sourceFiles(`${owner}/src`)))).flat();
const knownFiles = new Set(files);
const graph = new Map();
const failures = [];
const fail = (file, message) => failures.push(`${file}: ${message}`);
const isTest = (file) => /\.test\./.test(file) || file.includes("/test/");

for (const file of files) {
  const owner = owners.find((item) => file.startsWith(`${item}/`));
  const manifest = manifests.get(owner);
  const content = await readFile(file, "utf8");
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const imports = source.statements
    .filter((node) => ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    .map((node) => node.moduleSpecifier?.text)
    .filter(Boolean);
  function dynamic(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, dynamic);
  }
  dynamic(source);
  const edges = [];
  for (const specifier of imports) {
    if (specifier.startsWith("node:")) {
      if (owner.startsWith("packages/") && !isTest(file))
        fail(file, `pure package imports ${specifier}`);
      if (owner === "apps/web") fail(file, `browser code imports ${specifier}`);
      continue;
    }
    if (!specifier.startsWith(".")) {
      const name = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      const declared = {
        ...manifest.dependencies,
        ...(isTest(file) ? manifest.devDependencies : {}),
      };
      if (!declared[name]) fail(file, `undeclared dependency ${name}`);
      const targetOwner = packageOwners.get(name);
      if (targetOwner) {
        const suffix = specifier.slice(name.length);
        const targetManifest = manifests.get(targetOwner);
        const exportPath = suffix ? `.${suffix}` : ".";
        if (!targetManifest.exports?.[exportPath])
          fail(file, `imports private package path ${specifier}`);
        else {
          const target = path.normalize(path.join(targetOwner, targetManifest.exports[exportPath]));
          if (!isTest(file) && isTest(target)) fail(file, "production code imports test helpers");
          edges.push(target);
        }
        if (
          owner === "packages/core" ||
          (owner === "packages/rules-nl" && targetOwner !== "packages/core")
        )
          fail(file, `invalid package direction to ${targetOwner}`);
      }
      continue;
    }
    const base = path.normalize(path.join(path.dirname(file), specifier));
    const target = [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx")].find(
      (candidate) => knownFiles.has(candidate),
    );
    if (!target) {
      if (!specifier.endsWith(".css") && !specifier.includes("/generated/"))
        fail(file, `unresolved import ${specifier}`);
      continue;
    }
    edges.push(target);
    const targetOwner = owners.find((item) => target.startsWith(`${item}/`));
    if (targetOwner !== owner) fail(file, `relative import crosses package boundary: ${specifier}`);
    if (isTest(file)) continue;
    if (isTest(target)) fail(file, "production code imports test helpers");
    const area = file.slice(`${owner}/src/`.length).split("/")[0];
    const targetArea = target.slice(`${owner}/src/`.length).split("/")[0];
    const directions =
      owner === "apps/web"
        ? {
            app: ["app", "features", "infra", "shared", "config"],
            features: ["features", "infra", "shared", "config"],
            infra: ["infra", "shared", "config"],
            shared: ["shared"],
            config: ["config", "shared"],
          }
        : owner === "apps/cli"
          ? {
              entrypoints: ["entrypoints", "modules", "platform", "infra", "config", "shared"],
              modules: ["modules", "platform", "infra", "config", "shared"],
              platform: ["platform", "infra", "config", "shared"],
              infra: ["infra", "config", "shared"],
              config: ["config", "shared"],
              shared: ["shared"],
            }
          : undefined;
    if (directions && !directions[area]?.includes(targetArea))
      fail(file, `invalid direction ${area} → ${targetArea}`);
  }
  if (!isTest(file))
    graph.set(
      file,
      edges.filter((target) => !isTest(target)),
    );
}
const visited = new Set();
const stack = new Set();
function visit(file) {
  if (stack.has(file)) {
    fail(file, "dependency cycle");
    return;
  }
  if (visited.has(file)) return;
  visited.add(file);
  stack.add(file);
  for (const target of graph.get(file) ?? []) visit(target);
  stack.delete(file);
}
for (const file of graph.keys()) visit(file);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Architecture boundaries and declared dependencies checked across ${files.length} source files.`,
  );
