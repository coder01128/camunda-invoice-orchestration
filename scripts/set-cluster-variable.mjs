// Create or update a GLOBAL cluster variable (Camunda 8.9+), readable in FEEL as camunda.vars.env.<name>.
//
//   node scripts/set-cluster-variable.mjs <name> <json-file> [--profile=<c8ctl profile>]
//
// Uses c8ctl's own authenticated client, so credentials stay in the c8ctl profile store.
// Requires CLUSTER_VARIABLE CREATE/UPDATE permission (e.g. the built-in admin role).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [name, file] = process.argv.slice(2).filter(a => !a.startsWith("--"));
const profile = (process.argv.find(a => a.startsWith("--profile=")) || "--profile=smoke-test").split("=")[1];
if (!name || !file) { console.error("usage: node scripts/set-cluster-variable.mjs <name> <json-file> [--profile=x]"); process.exit(2); }
const value = JSON.parse(readFileSync(file, "utf8"));

const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { createClient } = await import(pathToFileURL(join(npmRoot, "@camunda8/cli/dist/core/client.js")).href);
const client = createClient(profile);

try {
  await client.createGlobalClusterVariable({ name, value });
  console.log(`✓ created cluster variable ${name}`);
} catch (e) {
  if (String(e?.status ?? e?.message ?? e).includes("409") || /already exists/i.test(String(e?.message ?? e))) {
    await client.updateGlobalClusterVariable({ name, value });
    console.log(`✓ updated cluster variable ${name}`);
  } else { console.error("✗", e?.message ?? e); process.exit(1); }
}
