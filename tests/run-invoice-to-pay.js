// End-to-end test of Invoice-to-Pay (and everything it calls) on a live cluster.
//   node tests/run-invoice-to-pay.js [--no-deploy]
// Starts every demo invoice, then acts as each human (approver, creditors clerk) until all complete,
// and checks where each invoice ended up. The AI review is live (Claude via the AI Agent connector),
// so AI-dependent expectations are reported separately from deterministic ones.
const fs = require("fs"), path = require("path");
const t = require("./lib/c8.js");

const CASES = {
  "01-clean-match":         { end: "paid",      approve: true,  match: "MATCHED" },
  "02-short-delivery":      { end: "paid",      approve: true,  match: "DISCREPANCY", flagged: true },
  "03-damaged-and-price":   { end: "queried",   approve: false, match: "DISCREPANCY", flagged: true },
  "04-substitution":        { end: "paid",      approve: true,  match: "DISCREPANCY", flagged: true },
  "05-exact-duplicate":     { end: "duplicate" },
  "06-totals-dont-add-up":  { end: "queried-invalid" },
  "07-near-duplicate":      { end: "queried",   approve: false, match: "MATCHED", aiFlagExpected: true },
};

(async () => {
  if (!process.argv.includes("--no-deploy")) t.deploy(["processes/"]);
  const runs = Object.entries(CASES).map(([name, exp]) => {
    const invoice = JSON.parse(fs.readFileSync(path.join("demo/invoices", `${name}.json`)));
    delete invoice._scenario;                       // never leak test hints into the AI prompt
    return { name, exp, key: t.start("invoice-to-pay", { invoice, paymentTimerOverride: "PT5S" }, invoice.invoice_number) };
  });
  console.log(`started ${runs.length} invoices`);

  // Act as the humans until every instance completes.
  const open = new Set(runs.map(r => r.key));
  await t.waitFor(() => {
    for (const r of runs.filter(r => open.has(r.key))) {
      if (t.incidents(r.key).length) { r.incident = true; open.delete(r.key); continue; }
      if (t.instance(r.key).state === "COMPLETED") { open.delete(r.key); continue; }
      const scopes = [r.key, ...t.search("pi", `--parentProcessInstanceKey=${r.key}`, "--state=ACTIVE").map(c => c.Key)];
      for (const s of scopes) for (const task of t.tasks(s)) {
        const n = task.Name || task.name, k = task.Key || task.key;
        if (/review/.test(n)) t.completeTask(k, { decision: r.exp.approve ? "approve" : "reject", approver: "e2e-test", comment: "e2e" });
        else if (n === "Query supplier") t.completeTask(k, { outcome: "Credit note received", notes: "e2e", handledBy: "e2e-test" });
        else if (n === "Include in creditors run") t.completeTask(k, { paymentReference: "EFT-E2E-" + r.name.slice(0, 2), processedBy: "e2e-test" });
      }
    }
    return open.size === 0;
  }, { timeoutMs: 600000, everyMs: 4000, what: "all invoices to complete" });

  let failed = 0;
  for (const r of runs) {
    const v = n => t.variable(r.key, n);
    const endedAs = r.incident ? "INCIDENT"
      : v("paymentRecord") ? "paid"
      : v("duplicateCheck")?.isDuplicate ? "duplicate"
      : v("validation")?.valid === false ? "queried-invalid"
      : v("queryOutcome") ? "queried" : "unknown";
    const m = v("matchResult"), ar = v("approvalRequest"), ai = v("agent")?.responseJson;
    const checks = [[endedAs === r.exp.end, `end=${endedAs}`]];
    if (r.exp.match) checks.push([m?.status === r.exp.match, `match=${m?.status}`]);
    if (r.exp.flagged) checks.push([ar?.flagged === true, `flagged=${ar?.flagged}`]);
    const ok = checks.every(c => c[0]); if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${r.name.padEnd(22)} ${checks.map(c => c[1]).join(" ")}` +
      (ai ? `  | AI risk=${ai.riskLevel} flags=${(ai.flags || []).map(f => f.type).join(",") || "none"}` : ""));
    if (r.exp.aiFlagExpected) console.log(`      AI check (non-deterministic): ${(ai?.flags || []).length ? "flagged as expected" : "NOT flagged"}`);
  }
  console.log(failed ? `\n${failed} case(s) failed` : `\nAll ${runs.length} invoice-to-pay cases passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
