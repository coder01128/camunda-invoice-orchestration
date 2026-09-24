// Minimal helpers for driving a Camunda 8 cluster from tests via c8ctl (JSON mode, no shell).
const { execSync, spawnSync } = require("child_process");
const path = require("path");

const C8 = process.env.C8CTL_JS || path.join(
  execSync("npm root -g", { encoding: "utf8" }).trim(), "@camunda8/cli/dist/index.js");
const PROFILE = "--profile=" + (process.env.C8_PROFILE || "smoke-test");

function c8(args, { json = true, allowFail = false } = {}) {
  // NB: c8ctl v4.2.0 writes SDK log lines to stdout and, in --json mode, some results
  // (e.g. create pi) to stderr. Read both streams and strip the log lines.
  const r = spawnSync(process.execPath, [C8, ...args, PROFILE, ...(json ? ["--json"] : [])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const clean = x => (x || "").split("\n").filter(l => !l.startsWith("[camunda-sdk]")).join("\n").trim();
  const out = clean(r.stdout), err = clean(r.stderr);
  if (r.status !== 0) {
    if (allowFail) return null;
    throw new Error(`c8ctl ${args.join(" ")} failed:\n${out}\n${err}`);
  }
  if (!json) return [out, err].filter(Boolean).join("\n");
  for (const body of [out, err]) { try { if (body) return JSON.parse(body); } catch {} }
  return out || err;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keyOf = r => String(r?.processInstanceKey ?? r?.key ?? r?.Key ?? JSON.stringify(r).match(/\d{15,}/)?.[0]);

module.exports = {
  c8, sleep,
  deploy: files => c8(["deploy", ...files], { json: false }),
  start: (id, vars, businessId) => keyOf(c8(["create", "pi", `--id=${id}`, `--variables=${JSON.stringify(vars)}`,
    ...(businessId ? [`--businessId=${businessId}`] : [])])),
  instance: key => c8(["get", "pi", key], { allowFail: true }) || {},  // {} while the search index catches up
  tasks: (pik, state = "CREATED") => {
    const r = c8(["search", "ut", `--processInstanceKey=${pik}`, `--state=${state}`], { allowFail: true });
    return Array.isArray(r) ? r : [];
  },
  completeTask: (key, vars) => c8(["complete", "ut", key, `--variables=${JSON.stringify(vars)}`], { json: false }),
  variable: (pik, name) => {
    const r = c8(["search", "vars", `--processInstanceKey=${pik}`, `--name=${name}`, "--fullValue"], { allowFail: true });
    if (!Array.isArray(r) || !r.length) return undefined;
    try { return JSON.parse(r[0].Value ?? r[0].value); } catch { return r[0].Value ?? r[0].value; }
  },
  incidents: pik => { const r = c8(["search", "inc", `--processInstanceKey=${pik}`], { allowFail: true }); return Array.isArray(r) ? r : []; },
  // poll fn() until it returns a truthy value or timeout
  waitFor: async (fn, { timeoutMs = 60000, everyMs = 2000, what = "condition" } = {}) => {
    const end = Date.now() + timeoutMs;
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await sleep(everyMs); }
  },
};
