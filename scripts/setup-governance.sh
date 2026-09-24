#!/usr/bin/env bash
# Governance setup: groups, roles and authorizations for approval routing.
#
#   manager group  -> can see / claim / complete ONLY tasks whose candidateGroups include "manager"
#   director group -> same, for "director"
#
# Mechanism (Camunda 8.9):
#   - built-in role `task-worker` = property-based USER_TASK authorizations
#     (READ, CLAIM, COMPLETE where the user is assignee, candidate user, or in a candidate group)
#   - COMPONENT "tasklist" ACCESS so members can open the Tasklist app
#
# Members are read from scripts/governance.local.env (gitignored — never commit real emails):
#   MANAGER_USERS="alice@example.com"
#   DIRECTOR_USERS="bob@example.com"
# Space-separate multiple users. On SaaS, users must already exist in the organisation
# (invited via Console); they are referenced here by their login (email).
#
# Safe to re-run: "already exists" responses are reported and skipped.
set -uo pipefail
cd "$(dirname "$0")"

PROFILE="--profile=${C8_PROFILE:-smoke-test}"
[ -f governance.local.env ] && source governance.local.env
MANAGER_USERS="${MANAGER_USERS:-}"
DIRECTOR_USERS="${DIRECTOR_USERS:-}"

run() {  # run a c8ctl command, print a one-line result, tolerate "already exists"
  local label="$1"; shift
  local out; out=$(c8ctl "$@" $PROFILE 2>&1 | grep -v camunda-sdk)
  if [[ $out == *"✓"* ]]; then echo "  ok      $label"
  elif [[ ${out,,} == *"already"* ]]; then echo "  exists  $label"
  else echo "  FAILED  $label"; echo "$out" | sed 's/^/          /'; FAILED=1; fi
}
FAILED=0

for g in manager director creditors; do
  name="$(tr '[:lower:]' '[:upper:]' <<< "${g:0:1}")${g:1}"
  echo "Group: $g"
  run "create group $g"                  create group --groupId="$g" --name="$name approvers"
  run "role task-worker -> group $g"     assign role task-worker --to-group="$g"
  run "tasklist access -> group $g"      create auth --ownerId="$g" --ownerType=GROUP \
                                           --resourceType=COMPONENT --resourceId=tasklist --permissions=ACCESS
done

if [ "${CREATE_LOCAL_USERS:-0}" = "1" ]; then
  # Local clusters (c8ctl cluster start / c8 Run) use basic auth, so demo users can be created here.
  # Not possible on SaaS, where users are invited through Console.
  echo "Local demo users (password: demo)"
  run "user demo-manager"  create user --username=demo-manager  --name="Demo Manager"  --email=demo-manager@example.com  --password=demo
  run "user demo-director" create user --username=demo-director --name="Demo Director" --email=demo-director@example.com --password=demo
  MANAGER_USERS="$MANAGER_USERS demo-manager"; DIRECTOR_USERS="$DIRECTOR_USERS demo-director"
fi

echo "Members"
for u in $MANAGER_USERS;  do run "user -> manager"  assign user "$u" --to-group=manager;  done
for u in $DIRECTOR_USERS; do run "user -> director" assign user "$u" --to-group=director; done
[ -z "$MANAGER_USERS$DIRECTOR_USERS" ] && echo "  (none configured — set them in scripts/governance.local.env)"

exit $FAILED
