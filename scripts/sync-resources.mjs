import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const sourceCatalog = process.env.SOURCE_CATALOG_PATH ?? "/Users/harrieum/Downloads/Catalog.csv";
const sourceResources =
  process.env.SOURCE_RESOURCES_DIR ?? "/Users/harrieum/Downloads/Troy University Resources";

const targetCatalog = path.resolve(projectRoot, "data/catalog/Catalog.csv");
const targetResources = path.resolve(projectRoot, "data/resources");

if (!fs.existsSync(sourceCatalog)) {
  throw new Error(`Catalog source not found: ${sourceCatalog}`);
}

if (!fs.existsSync(sourceResources)) {
  throw new Error(`Resources source not found: ${sourceResources}`);
}

fs.mkdirSync(path.dirname(targetCatalog), { recursive: true });
fs.cpSync(sourceCatalog, targetCatalog, { force: true });

fs.mkdirSync(targetResources, { recursive: true });
fs.cpSync(sourceResources, targetResources, {
  recursive: true,
  force: true,
});

console.log("Sync completed.");
console.log(`Catalog  : ${sourceCatalog} -> ${targetCatalog}`);
console.log(`Resources: ${sourceResources} -> ${targetResources}`);
