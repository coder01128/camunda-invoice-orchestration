# Approval Routing demo

Seeds nine **fictional** items into Approval Routing so the flow can be watched live in
Operate and worked by hand in Tasklist.

> **Demo values only.** `demo-limits.json` (auto ≤ R1,500, manager ≤ R15,000) was picked
> to exercise every path. These are **not** head-office approval limits. Every instance
> carries `limitsSource = "DEMO VALUES - not head-office limits"`, and the review form shows it.

## Run

```bash
bash demo/approval-routing/seed-demo.sh
```

Git Bash, from the repo root. It deploys the process, decision and form, then starts one
instance per row of `demo-items.tsv`, with the row's reference as the Business ID.

## What each item shows

| Ref | Amount | Path it demonstrates |
|---|---|---|
| INV-DEMO-001 / 002 / 003 | R640 to R1,420 | Auto-approved, no human involved |
| INV-DEMO-004 | R7,800 | Manager review (price increase) |
| INV-DEMO-005 | R12,500 | Manager review (short delivery) |
| INV-DEMO-006 | R48,000 | Straight to director review |
| VAR-DEMO-007 | −R3,600 | Negative variance still routed on size, to the manager |
| INV-DEMO-008 | R9,200 | Manager review. **Escalates to director review after 2 minutes** (demo timeout, real default 24h) |
| INV-DEMO-009 | R950 | No limits supplied, so the fail-safe sends it to the director and it is **not** auto-approved |

## Walkthrough

1. **Operate → Processes → Approval Routing** (turn on the Active and Completed filters). The node
   counts show 3 finished via Auto-approve, 4 at Manager review and 2 at Director review.
2. Leave it for 2 minutes. INV-DEMO-008 moves from Manager review to Director review
   by itself, and its history shows the manager task CANCELED by the timer.
3. **Tasklist**: open a Manager review task → **Assign to me**. The form shows the reference,
   supplier, amount, category, why it was flagged and which limits were used. Choose Approve or Reject,
   enter your name, then **Complete task**.
4. Back in Operate, open that instance. The **Variables** panel shows `approvalOutcome`:
   `{approved, approver, tier, escalated, comment}`. That object is what gets handed back
   to Invoice-to-Pay.

## Completing from the CLI instead of Tasklist

```bash
c8ctl search ut --state=CREATED --profile=smoke-test
c8ctl complete ut <taskKey> --variables='{"decision":"approve","approver":"Brad","comment":"ok"}' --profile=smoke-test
```

Use `search ut`, not `list ut`: in c8ctl v4.2.0, `list ut` ignores `--processInstanceKey`.
