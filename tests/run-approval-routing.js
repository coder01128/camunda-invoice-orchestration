// End-to-end test of processes/approval-routing.bpmn on a live cluster.
//   node tests/run-approval-routing.js           (deploys first)
// Starts one instance per fixture in tests/approval-routing/, checks the tier it routes to,
// completes the review task where one is expected, and verifies approvalOutcome.
const fs = require("fs"), path = require("path");
const t = require("./lib/c8.js");
const DIR = path.join(__dirname, "approval-routing");
const expected = JSON.parse(fs.readFileSync(path.join(DIR, "expected.json")));
const TASK = { manager: "Manager review", director: "Director review" };

(async () => {
  console.log(t.deploy(["processes/approval-routing.bpmn", "processes/approval-tier.dmn", "processes/approval-review.form"])
    .split("\n").filter(l => /\.(bpmn|dmn|form)/.test(l)).join("\n"));
  const runs = Object.entries(expected).map(([name, exp]) => {
    const vars = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`)));
    return { name, exp, key: t.start("approval-routing", vars) };
  });
  let failed = 0;
  const check = (run, ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${run.name.padEnd(17)} ${msg}`); if (!ok) failed++; };

  for (const run of runs) {
    const { exp, key } = run;
    try {
      if (exp.complete) {
        const want = TASK[exp.tier];
        const task = await t.waitFor(() => t.tasks(key).find(x => (x.Name || x.name) === want),
          { timeoutMs: exp.escalated ? 90000 : 30000, what: `${want} on ${run.name}` });
        t.completeTask(task.Key || task.key, exp.complete);
      }
      await t.waitFor(() => (t.instance(key).state === "COMPLETED"), { what: `${run.name} to complete` });
      const o = t.variable(key, "approvalOutcome");
      const wantApproved = exp.complete ? (exp.complete.decision ? exp.complete.decision === "approve" : exp.complete.approved) : true;
      const ok = o && o.tier === exp.tier && o.approved === wantApproved && (!!o.escalated === !!exp.escalated);
      check(run, ok, `tier=${o?.tier} approved=${o?.approved} escalated=${o?.escalated} approver=${o?.approver}`);
    } catch (e) { check(run, false, e.message.split("\n")[0]); }
    const inc = t.incidents(key); if (inc.length) check(run, false, `${inc.length} incident(s)`);
  }
  console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${runs.length} approval-routing cases passed`);
  process.exit(failed ? 1 : 0);
})();
