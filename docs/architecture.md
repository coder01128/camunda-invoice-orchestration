# Architecture and design decisions

## Principles
1. **Rules first, AI second, humans last.** Anything that can be checked deterministically is checked in FEEL: arithmetic, VAT, exact duplicates, and the invoice ↔ PO ↔ GRN match. Claude is asked only for judgement calls: near-duplicates, unusual prices, lines that don't fit the supplier. A human decides wherever there's doubt.
2. **The AI is advisory and fails safe.** Claude's output is structured JSON (`riskLevel`, `flags[]`, `summary`) with a schema enforced by the AI Agent connector. Any flag sets `flagged = true`, which the approval DMN treats as "never auto-approve". A false positive costs a human glance; a false negative falls back to the same checks as a clean invoice.
3. **Governance is configuration, not code.**
   - Approval limits are a **cluster variable** (`approvalLimits`), readable in FEEL as `camunda.vars.env.approvalLimits`. Admins change policy without redeploying.
   - Who can act on which task is enforced by **Camunda authorizations**: the built-in `task-worker` role plus candidate groups. The UI doesn't decide it.
4. **Fail safe everywhere.**
   - No limits configured → director review, never auto-approve.
   - No tolerance configured → every positive variance is escalated.
   - Due date unreadable → scheduled for the next run, with a note.
5. **Build once, call from everywhere.** Approval Routing is a single call activity used by four processes (invoices, write-offs, pour-cost variance, reorder requisitions).
6. **No custom workers to host.** All logic is FEEL script tasks, the DMN, and Camunda's own connectors (REST, AI Agent). The whole project runs on any 8.9 cluster with nothing else deployed.

## How the processes connect
- **Call activities (synchronous, explicit input/output mappings):**
  - Invoice-to-Pay calls Goods Receipt 3-Way Match, Approval Routing and Supplier Query
  - Waste, Pour-Cost and Stock Reorder call Approval Routing
- **Signal `stock-level-changed` (broadcast, decoupled):** 3-Way Match (goods received), Waste Write-off (stock written off) and Pour-Cost (closing count) throw it. Stock Reorder has a signal start event.
  - The payload is `{stockMovements: [{sku, qtyChange | level}], outlet, source, sourceRef}`.
  - The original brief said "message event". A signal was chosen because the throw side needs no job worker and any number of listeners can subscribe. The trade-off is that signals aren't correlated to a specific instance, which a reorder check doesn't need.

## Data
- **Invoice format:** the output of the existing pdf.js extractor (`supplier_name, supplier_vat, invoice_number, invoice_date, due_date, items[{product, volume, quantity, unit_price, line_total}], subtotal, vat_amount, total_due`), so extracted invoices feed straight in. Supplier invoices carry no PO number, so the match finds the open PO through the supplier's VAT number. An explicit `po_number` wins if one is present.
- **Mock systems:** `mock-data/*.json`, fetched by the REST connector from GitHub. `mockDataBaseUrl` overrides the location.
- **Stock levels:** computed from mock on-hand figures, because the mock data is static. A real build would read live inventory.

## Approval routing
- The DMN `approval-tier` (hit policy FIRST) has four inputs: limits configured, `abs(amount)`, flagged, category.
- The category column is reserved for per-category limits once real ones exist. The table contains **no numbers**; see [approval-routing.md](approval-routing.md).

## Access control

| Group | Role | Can do |
|---|---|---|
| `manager` | task-worker + Tasklist access | Manager review, Investigate variance |
| `director` | task-worker + Tasklist access | Director review (including escalations) |
| `creditors` | task-worker + Tasklist access | Query supplier, Include in creditors run |

Task-worker authorizations are property-based: a user sees, claims and completes a task only if they're its assignee, a candidate user, or in a candidate group. This was verified with two real logins; each saw only its own group's tasks.

## What is deliberately not built
- **Real payments:** the creditors-run task records a reference only.
- **Real POS or ERP integration:** everything is mocked, and Oracle Simphony access is unconfirmed.
- **Approver identity** comes from a form field. Production would take it from the authenticated Tasklist user, for example with a task listener.
- **PDF extraction runs client-side** in the separate pdf.js tool; this repo starts from its JSON. A later step could pass the PDF itself to the AI Agent connector as a document.
