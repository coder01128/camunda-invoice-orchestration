#!/usr/bin/env bash
# Seed Approval Routing with fictional demo items so the flow can be watched live
# in Operate and worked in Tasklist.
#
# ALL DATA IS FICTIONAL. demo-limits.json holds DEMO values chosen only to exercise
# every path. They are NOT head-office approval limits and must not be presented as such.
#
# Usage (Git Bash, from the repo root):  bash demo/approval-routing/seed-demo.sh
set -euo pipefail
cd "$(dirname "$0")"

PROFILE="--profile=smoke-test"
LIMITS=$(tr -d '\n' < demo-limits.json)
LIMITS_SOURCE="DEMO VALUES - not head-office limits"

echo "Deploying approval-routing (process, decision, form)..."
c8ctl deploy ../../approval-routing/approval-routing.bpmn \
             ../../approval-routing/approval-tier.dmn \
             ../../approval-routing/approval-review.form $PROFILE 2>&1 | grep -v camunda-sdk

echo
echo "Starting demo instances..."
tail -n +2 demo-items.tsv | while IFS=$'\t' read -r ref amount category supplier reason timeout useLimits; do
  vars="{\"sourceRef\":\"$ref\",\"amount\":$amount,\"category\":\"$category\",\"supplier\":\"$supplier\",\"flagReason\":\"$reason\""
  if [ "$useLimits" = "yes" ]; then
    vars="$vars,\"approvalLimits\":$LIMITS,\"limitsSource\":\"$LIMITS_SOURCE\""
  else
    vars="$vars,\"limitsSource\":\"NONE SUPPLIED - fail-safe routes to director\""
  fi
  [ "$timeout" != "-" ] && vars="$vars,\"escalationTimeout\":\"$timeout\""
  vars="$vars}"

  key=$(c8ctl create pi --id=approval-routing --businessId="$ref" --variables="$vars" $PROFILE 2>&1 \
        | grep -o 'Key: [0-9]*' | cut -d' ' -f2)
  printf '  %-13s R %7s  %-10s -> instance %s\n' "$ref" "$amount" "$category" "$key"
done

echo
echo "Done. Expected: 001-003 auto-approved; 004, 005, 007, 008 at Manager review;"
echo "006 and 009 at Director review; 008 escalates to Director review after 2 minutes."
