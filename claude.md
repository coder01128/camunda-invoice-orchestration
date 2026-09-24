# CLAUDE.md

## What this project is
An orchestration prototype for the restaurant supplier-invoice opportunity — a national restaurant group using Oracle POS (likely Simphony) across multiple outlets, with all purchasing routed through a centralised head office. This repo is where that gets prototyped on Camunda 8, driven end-to-end from Claude Code via the `c8ctl` CLI — not hand-clicked through Camunda Console.

It doubles as a portfolio/job-search piece (agentic orchestration), so it should stay something Brad can explain and defend line by line — no invented figures, no capabilities claimed that aren't actually built.

## Ultimate goal — the v1 process (full scope agreed 24 Sep 2026)

1. **Approval Routing** (shared call activity — build once, every process below calls into it)
   - In: amount/variance, category, flag reason
   - DMN table: threshold by amount + category → auto-approve / manager / director. **Thresholds are unknown — do not invent numbers. Leave as an open variable until Brad has real limits from the restaurant group's head office.**
   - User task: review, boundary timer escalates a tier if no response in 24h
   - Out: approved/rejected + approver

2. **Invoice-to-Pay** (main process)
   Submit invoice (JSON/photo) → extraction/validation service task → call activity: Goods Receipt 3-Way Match → AI line-item check (Claude — duplicates, policy) → call activity: Approval Routing → payment scheduled (timer to terms date) → creditors-run task. Reject path → dispute/query-supplier subprocess.
   - Extraction: Brad already has a working pdf.js client-side extraction prototype (drag-and-drop, localStorage, XLSX/JSON export) from earlier exploration of this same opportunity. Its location is recorded in Claude's private project memory (kept out of this repo because the folder name identifies the client). Reuse its extraction logic rather than building from scratch.
- This repo may become public (portfolio / job application). Never commit the client's name, real invoices, or real POS data.

3. **Goods Receipt 3-Way Match** (call activity from #2)
   Confirm PO ↔ delivery ↔ invoice line items. Discrepancy gateway (short-delivered/damaged/substituted) flags back into #2 rather than duplicating approval logic.

4. **Pour-Cost Reconciliation**
   Pull POS sales (Oracle) → theoretical stock depletion → compare to physical stock reading → variance gateway → over tolerance calls Approval Routing.

5. **Waste/Spoilage Write-off**
   Staff logs a write-off → straight into Approval Routing on amount.

6. **Stock Reorder** (loop-closer)
   Message event: a stock update from #3 or #5 drops a SKU below threshold → starts a new Purchase Requisition, which re-enters #2.

This is the target architecture, not a build order. Nothing above gets built until the smoke test passes.

## Current phase: full v1 build (smoke test PASSED 24 Sep 2026)
Brad's call (24 Sep 2026): build all six processes, fully working, runnable on any Camunda 8 cluster via one setup script, public repo, Loom demo. Oracle POS stays mocked with clearly labelled sample data — no integration claimed.

## Smoke test (historical — passed)
A throwaway 4-node flow with zero domain logic, purely to confirm Claude Code can deploy to and drive this cluster end to end:

`Start Event → Service Task "Ping" (job type: cc-smoke-ping) → User Task "Confirm" (id: confirm-test) → End Event`

Pass/fail checklist:
1. `c8 deploy ./cc-smoke-test.bpmn` deploys cleanly
2. `c8 create pi --id=cc-smoke-test --variables='{"initiatedBy":"claude-code"}'` starts an instance
3. The `cc-smoke-ping` job can be listed, activated, and completed via c8ctl
4. The `confirm-test` user task can be found and completed via c8ctl
5. `c8 get pi <key> --variables` shows the instance COMPLETED with variables intact

Do not start on the real processes above until all five pass. Report which passed, which didn't, and the exact command syntax that worked.

## Where to find things
- **c8ctl**: installed globally (`npm install @camunda8/cli -g`). Requires Node ≥22.18.0 — check with `node --version`, don't assume.
- **Cluster credentials**: a c8ctl profile named `smoke-test` (`c8 add profile smoke-test --baseUrl=... --clientId=... --clientSecret=...`), activated with `c8 use profile smoke-test`. Credentials live only in the c8ctl profile store — never hardcode them into a file in this repo, never commit them.
- **Environment**: Windows. Windows terminal syntax only, no Unix-isms.
- **c8ctl is alpha software** — commands and flags drift from the docs between releases. Before running a command you're not certain of, run `c8ctl --help` or `c8ctl <command> --help` and use what it actually reports, not what a doc or an earlier session says.

## Rules
- Never invent DMN thresholds, approval limits, or any business figure — leave it as an open variable and name what's needed to fill it in.
- Never claim confirmed Oracle/Simphony integration until that's actually verified with the restaurant's IT — treat POS API access as unconfirmed until stated otherwise.
- This is a prototype, not a production deployment for the restaurant group — no real invoice or POS data goes through it without Brad's explicit sign-off.