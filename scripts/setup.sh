#!/usr/bin/env bash
# One-command setup: deploys every process/decision/form, sets the configuration cluster
# variables, and creates the approval groups/permissions, on ANY Camunda 8.9+ cluster.
#
#   C8_PROFILE=<your c8ctl profile> bash scripts/setup.sh
#
# Prerequisites
#   - Node >= 22.18 and c8ctl (npm i -g @camunda8/cli), with a profile pointing at your cluster
#     (SaaS: `c8ctl add profile x --from-file <console credentials>`; local: `c8ctl cluster start`)
#   - The profile's client must be allowed to deploy, write cluster variables and manage
#     groups/authorizations (on SaaS with authorizations enabled: assign it the Admin role)
#   - An Anthropic API key as a connector secret named ANTHROPIC_API_KEY
#       SaaS:  Console -> cluster -> Connector secrets
#       local: c8ctl cluster secrets set ANTHROPIC_API_KEY   (then restart the local cluster)
#     Without it everything runs except the AI review step, which raises an incident.
#   - Outbound internet from the cluster's connectors (mock data is fetched from GitHub)
set -uo pipefail
cd "$(dirname "$0")/.."
export C8_PROFILE="${C8_PROFILE:-smoke-test}"
P="--profile=$C8_PROFILE"
step() { printf '\n== %s\n' "$*"; }

step "Checking tools"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<18)){console.error("Node >= 22.18 required, found "+process.versions.node);process.exit(1)}' || exit 1
c8ctl --version >/dev/null 2>&1 || { echo "c8ctl not found: npm i -g @camunda8/cli"; exit 1; }
echo "node $(node --version), $(c8ctl --version), profile $C8_PROFILE"
c8ctl get topology $P >/dev/null 2>&1 || { echo "Cannot reach the cluster with profile $C8_PROFILE"; exit 1; }
echo "cluster reachable"

step "Deploying processes, decisions and forms"
c8ctl deploy ./processes $P 2>&1 | grep -v camunda-sdk | grep -E '✓|✗|\.(bpmn|dmn|form)' | sed 's/^/  /'

step "Setting configuration cluster variables (DEMO values - replace with real ones)"
node scripts/set-cluster-variable.mjs approvalLimits    config/approval-limits.demo.json    "$P" 2>&1 | grep -v camunda-sdk | sed 's/^/  /'
node scripts/set-cluster-variable.mjs pourCostTolerance config/pour-cost-tolerance.demo.json "$P" 2>&1 | grep -v camunda-sdk | sed 's/^/  /'

step "Creating approval groups and permissions"
bash scripts/setup-governance.sh | sed 's/^/  /'

step "Done"
cat <<EOF
  Try it:   node demo/seed.js            (starts the demo scenarios, leaves tasks for you in Tasklist)
  Test it:  node tests/run-approval-routing.js && node tests/run-invoice-to-pay.js
EOF
