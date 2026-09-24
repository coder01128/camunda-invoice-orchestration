# Product friction log

Everything below was hit while building this project on **Camunda 8.9 SaaS** with **c8ctl v4.2.0**, driven from Claude Code on Windows 10 (24 Sep 2026).
Each entry records what happened, how it was confirmed, the workaround, and a suggestion.
The ones that touch access control and administration are grouped first, because that is where the surprises cost the most time.

## Governance and administration

### 1. Enabling authorizations silently empties an existing API client's view
- **What happened:** after switching *Authorizations* on in Console, the CLI client that had deployed everything could still log in, but `search pi` returned **no instances** (there were 15+) and `list roles` returned "No roles found". There was no 403 and no hint that results were being filtered.
- **Confirmed:** the same searches returned full results again after the client was assigned the `admin` role (Admin → Roles → Admin → **Clients** tab).
- **Why it matters:** an empty result looks like data loss rather than a permissions problem.
- **Suggestion:** the enable dialog could list API clients that have no role and would lose access. Search responses could also indicate that results were filtered by authorization.

### 2. It's easy to put a client ID in the wrong "Assign" dialog
- **What happened:** the Admin role page opens on the **Users** tab, and its "Assign user" field accepts a client ID without complaint (a user that doesn't exist).
- **Suggestion:** validate the entry against existing users, or detect that the value looks like a client ID and offer to switch to the Clients tab.

### 3. The org owner's cluster access isn't visible in Admin
- **What happened:** the Admin role showed "No users assigned", yet the org owner had full access. Where that access comes from isn't visible anywhere on the cluster side.
- **Suggestion:** show inherited or implicit access, for example "Org owner (via Console)".

### 4. Git sync on SaaS needs a hand-built GitHub App
- **What happened:** connecting a Web Modeler process application to GitHub meant creating a GitHub App, setting three permissions, generating a private key, installing the app, and copying the Installation ID out of a URL. That's about ten steps.
- **Also:** on the first sync, the conflict dialog offered "Web Modeler" or "GitHub" without saying which files would be overwritten.
- **Suggestion:** offer a Camunda-owned GitHub App with a one-click install, and show a file-level diff in the first-sync conflict dialog.

### 5. Trial dev clusters wipe their disk when they auto-pause
- **Documented behaviour, but surprising:** a demo deployed in the morning can be gone that evening.
- **Suggestion:** warn before the first auto-pause, or offer "redeploy last deployment" on resume.

## c8ctl

### 6. `c8ctl list ut --processInstanceKey=…` ignores the filter (bug)
- **Confirmed with `--dry-run`:** the request body contains only `state`, and the `processInstanceKey` filter is dropped. `c8ctl search ut --processInstanceKey=…` sends it correctly.
- **Why it matters:** with one task on the cluster the command looks correct. With several, it silently returns every task.
- **Suggestion:** pass the filter through, or reject filters a command doesn't support.

### 7. In `--json` mode, results go to stderr and log lines go to stdout
- **Seen with `create pi --json`:** `{"status":"success","key":…}` arrives on **stderr**, while `[camunda-sdk][info][auth:oauth] Token fetched…` arrives on **stdout**.
- **Impact:** `c8ctl … --json | jq` breaks.
- **Workaround:** read both streams and drop lines starting with `[camunda-sdk]` (see `tests/lib/c8.js`).

### 8. Console's credentials download doesn't match `add profile --from-file`
- **What happened:** Console downloads `ZEEBE_REST_ADDRESS` and similar variables, but `--from-file` requires `CAMUNDA_BASE_URL`, which the download doesn't include.
- **Workaround:** add `CAMUNDA_BASE_URL=<ZEEBE_REST_ADDRESS>` to the file by hand.
- **Suggestion:** fall back to `ZEEBE_REST_ADDRESS`, or have Console include `CAMUNDA_BASE_URL`.

### 9. `deploy` asks which profile to use when one is already active
- **Message:** "Multiple profiles configured but no profile specified", shown even after `c8ctl use profile smoke-test`.
- **Workaround:** pass `--profile` or `--yes`.

### 10. `c8ctl open operate` is self-managed only
- **Message:** "Cannot derive operate URL" for SaaS base URLs.
- **Suggestion:** build the URL from the SaaS cluster ID and region, which are both in the base URL.

### 11. There are no commands for cluster variables or signal broadcast
- **Workaround:** `scripts/set-cluster-variable.mjs` imports c8ctl's own `createClient` and calls the bundled SDK's `createGlobalClusterVariable`.

### 12. `get pi` straight after `create pi` returns NOT_FOUND
- **Cause:** eventual consistency, as documented. It still trips up every script that creates an instance and immediately checks it.
- **Suggestion:** a `--wait` option on `get`.

### 13. Some environments move where profiles are stored
- **What happened:** c8ctl keeps profiles in `%APPDATA%\c8ctl`. Inside an MSIX-packaged host (the Claude desktop app), Windows redirects that folder, so a profile added in a normal terminal was invisible to the embedded shell. Not a Camunda bug.
- **Suggestion:** `C8CTL_DATA_DIR` already exists; one line about it in the troubleshooting docs would have saved an hour.

## Modelling and FEEL

### 14. Bare names inside a FEEL filter resolve to the list item first
- **Example:** `erpProducts[item.sku = sku]` compares each item's `sku` with itself, so it always matches and returns the first product.
- **How it was caught:** a write-off of 5 gin bottles was priced at R62.50 (the cola price) instead of R945.
- **Workaround:** bind the outer value to a non-colliding name first: `{wanted: sku, p: erpProducts[item.sku = wanted]}`.
- **Suggestion:** a `bpmn lint` rule that warns when a filter compares `item.x` with a bare `x`.

### 15. `camunda.vars.env` prints `{}` while `camunda.vars.env.approvalLimits` resolves
- **Impact:** exploring cluster variables with `feel evaluate` makes it look as if none exist.

### 16. The AI Agent system prompt is FEEL-only
- **What happened:** `element-template apply --set data.systemPrompt.prompt=<plain text>` prepends `=` automatically, which produces invalid FEEL. `bpmn lint` catches it (nice), but `apply` could quote plain text for FEEL-required fields instead.

## Things that worked well
- `c8ctl --dry-run` is excellent for debugging: it's how the `list ut` bug above was proven.
- `c8ctl element-template apply` is a genuinely good way to configure connectors from code.
- Property-based USER_TASK authorizations (the `task-worker` role) did exactly what the approval design needed, with no custom code.
- Cluster variables are a clean home for admin-owned policy such as approval limits.
- `c8ctl bpmn lint` caught real problems (a fake join, an invalid FEEL prompt) before deployment.
