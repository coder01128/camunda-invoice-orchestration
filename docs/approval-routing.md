# Approval Routing

A shared call activity. Invoice-to-Pay, Waste Write-off, Pour-Cost Reconciliation and Stock Reorder all call into it, so none of them builds its own approval logic.

| File | What it is |
|---|---|
| `processes/approval-routing.bpmn` | Process `approval-routing` |
| `processes/approval-tier.dmn` | Decision `approval-tier` (called by the process) |
| `processes/approval-review.form` | Tasklist form for Manager / Director review |
| `tests/approval-routing/` | Synthetic inputs and expectations for every path |

## Flow
Start → **Resolve approval limits** → **Determine approval tier** (DMN) → gateway:
- `auto` → **Auto-approve** → end
- `manager` → **Manager review** (group `manager`). If nobody responds within the escalation timeout, a timer cancels it and escalates to director review.
- `director` (default) → **Director review** (group `director`) → end

## Contract

**In** (variables from the caller):

| Variable | Type | Notes |
|---|---|---|
| `amount` | number | Amount or variance. Tiering uses `abs(amount)`. |
| `category` | string | `supplier-invoice`, `waste`, `pour-cost` or `stock-requisition`. No rule uses it yet. |
| `flagReason` | string | Why this needs approval. Shown on the review form. |
| `flagged` | boolean | `true` when a 3-way-match discrepancy or AI flag exists. **Flagged items are never auto-approved.** |
| `approvalLimits` | `{autoApproveMax, managerMax}` | *Optional override.* The default is the admin-managed **cluster variable** `approvalLimits`. |
| `escalationTimeout` | ISO 8601 duration | Optional. Defaults to `PT24H`. Tests use `PT30S`. |
| `sourceRef`, `supplier` | string | Shown on the form. |

**The reviewer completes the task with:** `decision` (`approve` / `reject`, from the form) or `approved` (boolean, for CLI/API use), plus `approver` and `comment`.

**Out:** `approvalOutcome` = `{approved, approver, tier, escalated, comment}`. `escalated` is `true` only when the manager review timed out and the director decided.

## How the limits are resolved
1. `approvalLimits` passed by the caller, if present
2. otherwise the cluster variable `camunda.vars.env.approvalLimits`, set by `scripts/set-cluster-variable.mjs` from `config/approval-limits.demo.json`
3. otherwise nothing: the DMN fails safe to **director**, and nothing is auto-approved

`limitsSource` records which of these applied, and the review form shows it, so a reviewer always knows whether the limits in use are demo values.

## DMN rules (hit policy FIRST)

| # | Limits configured | abs(amount) | Flagged | Category | Tier |
|---|---|---|---|---|---|
| 1 | false | - | - | - | director (fail-safe) |
| 2 | true | `<= approvalLimits.autoApproveMax` | false | - | auto |
| 3 | true | `<= approvalLimits.managerMax` | - | - | manager |
| 4 | - | - | - | - | director |

The table contains no numbers; the limits are variables. A flagged item under the auto limit falls through to rule 3 (manager).

## Tested: `node tests/run-approval-routing.js` (8/8 pass, 24 Sep 2026)

| Case | Input | Routed to |
|---|---|---|
| a | empty limits `{}` | director (fail-safe) |
| b | 5 (limits 10/20) | auto |
| c | 15 | manager, approved |
| d | 25 | director, rejected |
| e | −15 | manager (the absolute value is used) |
| f | 15, `PT30S` | manager, then escalated to director |
| g | 5, flagged | manager (not auto) |
| h | 5, no override | auto, using the cluster-variable limits |

## Open decisions (need Brad or head office)
1. **Real limits:** `autoApproveMax` and `managerMax`, and whether they vary by category.
2. **Categories:** the real category list. Per-category rows get added to the DMN once it's known.
3. **Fail-safe tier:** director today. Should it be manager?
4. **Director escalation:** is there a tier above director, or should it just send a reminder?
5. **Flag policy:** any AI or match flag currently forces a human. Should a *low-risk* AI flag be allowed through?
6. **Approver identity:** currently typed into the form. Production should take it from the Tasklist login.
