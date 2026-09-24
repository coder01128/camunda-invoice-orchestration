// Seeds a live demo: every scenario running at once, human tasks left open for Tasklist.
//   node demo/seed.js            (uses C8_PROFILE, default smoke-test)
// ALL DATA IS FICTIONAL. Approval limits and tolerances come from the DEMO cluster variables.
const fs = require("fs"), path = require("path");
const t = require("../tests/lib/c8.js");

const PAY_DELAY = process.env.PAY_DELAY || "PT2M";   // demo only: approved invoices reach the creditors run after this
const started = [];
const start = (proc, vars, ref, note) => { const key = t.start(proc, vars, ref); started.push({ proc, ref, key, note }); };

for (const file of fs.readdirSync(path.join(__dirname, "invoices")).sort()) {
  const invoice = JSON.parse(fs.readFileSync(path.join(__dirname, "invoices", file)));
  const note = invoice._scenario; delete invoice._scenario;
  start("invoice-to-pay", { invoice, paymentTimerOverride: PAY_DELAY }, invoice.invoice_number, note);
}
start("waste-writeoff", { outlet: "OUTLET-A", sku: "SP-GIN-750", quantity: 5, reason: "Breakage", loggedBy: "Bar staff (demo)", notes: "Crate dropped" },
  "WASTE-DEMO-1", "R945: auto-approved; drops gin below reorder point -> Stock Reorder");
start("waste-writeoff", { outlet: "OUTLET-A", sku: "SP-WHISKY-750", quantity: 12, reason: "Spoilage / expired", loggedBy: "Bar staff (demo)", notes: "Cork taint" },
  "WASTE-DEMO-2", "R2,940: manager approval");
start("pour-cost-reconciliation", { outlet: "OUTLET-A" }, "POURCOST-DEMO", "Gin +38.8%, whisky +13.3% over tolerance -> manager (flagged)");

console.log("Started:");
for (const s of started) console.log(`  ${s.proc.padEnd(25)} ${String(s.ref).padEnd(15)} ${s.note || ""}`);
console.log(`
What to look at:
  Operate  -> Processes: every instance, live. Open one to see its path and variables.
  Tasklist -> as ${"manager"}: invoice reviews, write-off, pour-cost variance, reorder requisitions
           -> as director: INV JSD-77201 (R22,121: over the manager limit)
           -> as admin/creditors: supplier queries; creditors runs appear ${PAY_DELAY} after approval
  Stock Reorder instances start by themselves from stock signals (goods received, write-offs, stock count).`);
