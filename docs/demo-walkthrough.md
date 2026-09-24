# Demo walkthrough (about 3 minutes)

This is the script for the recorded demo, and it's how to explore the project yourself after `scripts/setup.sh`.

## Before recording
1. `node demo/seed.js`, about 2 minutes before you start. Every scenario begins running: 8 invoices, 2 write-offs and 1 stock count. The AI reviews finish within about 30s.
2. Open three browser windows:
   - **Operate** as admin
   - **Tasklist** as the *manager* login (incognito)
   - **Tasklist** as the *director* login (a second incognito window)

## Script

| Time | Show | Say |
|---|---|---|
| 0:00 | README diagram | "A restaurant group routes every supplier invoice through head office. Seven processes, one shared approval step, and Claude checking invoice lines, with a human always deciding." |
| 0:20 | Operate → Processes | "Everything seeded here is running now." Point at the instance counts on each step. |
| 0:35 | Operate → Invoice-to-Pay → **HSD-2026-0872** → Variables `agent` | "The rules passed this invoice: new number, clean 3-way match. Claude flagged it as a near-duplicate of yesterday's paid invoice. Same items, same total." |
| 1:00 | Tasklist (**manager**) | "The manager sees only manager-level work. It's R1,230, under the auto-approve limit, but because it's flagged a human has to decide." **Reject** it with a comment. |
| 1:20 | Tasklist (manager): try to find **JSD-77201** | "The R22,000 order isn't here. It's over the manager's limit, and Camunda's authorizations hide it from this login." |
| 1:35 | Tasklist (**director**) → JSD-77201 → **Approve** | "The director sees it and approves it." |
| 1:50 | Operate → **Stock Reorder** | "Nobody started these. The substituted Cabernet delivery, the gin breakage and the bar stock count each broadcast a stock signal, and a reorder requisition was raised." |
| 2:10 | Operate → Pour-Cost instance → `pourCost` | "POS sales times recipes against the physical count: gin is 38.8% over. The tolerance is an admin-managed cluster variable." |
| 2:30 | Admin → Groups / Authorizations, then Console → cluster variables | "Governance is configuration: groups, roles and property-based task permissions, with limits as cluster variables." |
| 2:45 | GitHub: README, tests, friction log | "It's all in a public repo, and one script runs it on any Camunda 8.9 cluster. I kept a friction log of the product issues I hit along the way." |

## Scenario reference

| Ref | Expect |
|---|---|
| HSD-2026-0934 | Clean match. Manager approval (by amount), then creditors run after `PAY_DELAY` |
| KCB-3342 | Short delivery (24 lager). Flagged, manager |
| JSD-77188 | 2 gin damaged plus a vodka price increase. Flagged, manager |
| CCW-11902 | Cabernet substituted with Merlot. Flagged, manager, and a Cabernet reorder |
| HSD-2026-0871 | Exact duplicate. Rejected automatically, no AI call |
| KCB-3350 | Totals don't add up. Supplier query |
| HSD-2026-0872 | Near-duplicate. **Only Claude catches it**, so manager review |
| JSD-77201 | R22,121 clean order. **Director only** |
| WASTE-DEMO-1 | 5 gin, R945. Auto-approved, then gin reorder |
| WASTE-DEMO-2 | 12 whisky, R2,940. Manager |
| POURCOST-DEMO | Gin and whisky over tolerance. Flagged, manager; if rejected, investigation |
