// Usage: node scripts/dev/generate.js <spec-name>
// Writes processes/<id>.bpmn from scripts/dev/specs/<spec-name>.js, then applies connector
// element templates with c8ctl (REST for nodes with `mockUrl`, AI Agent for nodes with `ai`), then lints.
const { execFileSync } = require("child_process"), path = require("path");
const gen = require("./bpmn-gen.js");
const spec = require(`./specs/${process.argv[2]}.js`);
const file = path.join("processes", `${spec.id}.bpmn`);
gen.write(spec, file);
const C8 = path.join(process.env.APPDATA || "", "npm/node_modules/@camunda8/cli/dist/index.js");
const c8 = args => execFileSync(process.execPath, [C8, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

for (const n of spec.nodes.filter(n => n.mockUrl)) {
  c8(["element-template", "apply", "io.camunda.connectors.HttpJson.v2", n.id, file, "-i",
    "--set", "authentication.type=noAuth", "--set", "method=GET", "--set", `url=${n.mockUrl}`,
    "--set", `resultExpression=${n.resultExpression || "={erpSuppliers: response.body.suppliers, erpPurchaseOrders: response.body.purchaseOrders, erpGoodsReceipts: response.body.goodsReceipts, erpProducts: response.body.products}"}`,
    "--set", "retries=3", "--set", "retryBackoff=PT5S"]);
  console.log("REST template ->", n.id);
}
for (const n of spec.nodes.filter(n => n.ai)) {
  const sets = Object.entries(n.ai).flatMap(([k, v]) => ["--set", `${k}=${v}`]);
  c8(["element-template", "apply", "io.camunda.connectors.agenticai.aiagent.v1", n.id, file, "-i", ...sets]);
  console.log("AI Agent template ->", n.id);
}
try { console.log(c8(["bpmn", "lint", file])); } catch (e) { console.log(e.stdout || "", e.stderr || ""); process.exitCode = 1; }
