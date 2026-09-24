# Approval Routing

Shared call activity. Every process that needs sign-off (Invoice-to-Pay, Pour-Cost
Reconciliation, Waste/Spoilage Write-off) calls into this one instead of building its own.

| File | What it is |
|---|---|
| `approval-routing.bpmn` | Process `approval-routing` |
| `approval-tier.dmn` | Decision `approval-tier` (called by the process) |
| `test-fixtures/` | Synthetic inputs used to test every path |

## Flow

Start → **Determine approval tier** (DMN) → gateway:
- `auto` → **Auto-approve** (script task) → end
- `manager` → **Manager review** (user task, group `manager`). If nobody responds within the
  escalation timeout, a boundary timer cancels it and escalates to director review
- `director` (default) → **Director review** (user task, group `director`) → end

## Contract

**In** (process variables supplied by the caller):

| Variable | Type | Notes |
|---|---|---|
| `amount` | number | Invoice amount or variance. Tiering uses `abs(amount)`, so a negative variance routes like a positive one |
| `category` | string | Passed into the DMN. No rule uses it yet (see open decisions) |
| `flagReason` | string | Why this needs approval. Display only, not used in routing |
| `approvalLimits` | `{autoApproveMax, managerMax}` | **Real values not yet known.** If missing, everything goes to director review |
| `escalationTimeout` | ISO 8601 duration | Optional. Defaults to `PT24H` (the agreed 24h). Tests override it to `PT30S` |

**Reviewer completes the user task with:** `decision` (`"approve"`/`"reject"`, from the Tasklist form `approval-review.form`) or `approved` (boolean, for CLI/API use), plus `approver` (string) and `comment` (string, optional).

**Optional display variables** shown on the form: `sourceRef`, `supplier`, `limitsSource`.

**Out:** `approvalOutcome` = `{approved, approver, tier, escalated, comment}`
- `tier`: `auto` / `manager` / `director`
- `escalated`: `true` only when a manager review timed out and a director decided

## DMN rules (hit policy FIRST)

| # | Limits configured | abs(amount) | Category | Tier |
|---|---|---|---|---|
| 1 | false | - | - | director (fail-safe) |
| 2 | true | `<= approvalLimits.autoApproveMax` | - | auto |
| 3 | true | `<= approvalLimits.managerMax` | - | manager |
| 4 | - | - | - | director |

The table contains no numbers. The limits are variables.

## Tested (24 Sep 2026, SaaS cluster, synthetic limits 10 / 20)

| Case | Input | Routed to | Outcome |
|---|---|---|---|
| A | no limits, 5 | director | fail-safe held, no auto-approve |
| B | 5 | auto | COMPLETED, no human task |
| C | 15 | manager | approved |
| D | 25 | director | rejected (`approved: false`) |
| E | −15 | manager | approved (the absolute value was used) |
| F | 15, `PT30S` timeout | manager → director at +30s | manager task CANCELED, `escalated: true` |

All six COMPLETED, 0 incidents.

## Open decisions (need Brad or head office)

1. **Real limits.** `autoApproveMax` and `managerMax` values, and whether they differ per category.
2. **Categories.** The real category list. Per-category rows get added to the DMN once it is known.
3. **Fail-safe tier.** Items with no limits configured currently go to **director**. Should it be manager instead?
4. **Director escalation.** Director review has no timeout. Is there a tier above director (e.g. FD/CEO), or should it just remind?
5. **Does `flagReason` affect routing?** For example, should an AI-flagged duplicate always need a human even under the auto limit? Right now it doesn't.
6. **Approver identity.** The reviewer passes `approver` in by hand. Real use should take it from the logged-in Tasklist user.
7. **Form content.** `approval-review.form` is a working first version. It still needs sign-off on what reviewers actually need to see (line items, PO/GRN refs, attachments).
