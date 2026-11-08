#!/usr/bin/env bash
# Run this reviewed file in Google Cloud Shell. Preview is entirely offline.
set -euo pipefail

readonly PROJECT='ennearock-web'
readonly TOPIC='solace-play-rtdn'
readonly SUBSCRIPTION='solace-play-rtdn-push'
readonly PUSH_ACCOUNT='solace-play-rtdn-push'
readonly PUSH_EMAIL="${PUSH_ACCOUNT}@${PROJECT}.iam.gserviceaccount.com"
readonly TOPIC_RESOURCE="projects/${PROJECT}/topics/${TOPIC}"
readonly SUBSCRIPTION_RESOURCE="projects/${PROJECT}/subscriptions/${SUBSCRIPTION}"
readonly ENDPOINT='https://www.solace-pomodoro.com/api/billing/native/webhooks/google'
readonly PLAY_PUBLISHER='google-play-developer-notifications@system.gserviceaccount.com'
MODE="${1:---preview}"
WRITE_ATTEMPTED=false

die() {
  printf '{"ok":false,"code":"%s","writeAttempted":%s,"purchasesEnabled":false,"deploymentPerformed":false}\n' "$1" "$WRITE_ATTEMPTED"
  exit 1
}

if [[ $# -gt 1 || ! "$MODE" =~ ^--(preview|apply|verify)$ ]]; then
  die INVALID_MODE
fi

if [[ "$MODE" == '--preview' ]]; then
  printf '{"ok":true,"mode":"preview","projectId":"%s","topic":"%s","subscription":"%s","pushServiceAccount":"%s","pushEndpoint":"%s","audience":"%s","networkRequests":0,"writeAttempted":false,"purchasesEnabled":false,"deploymentPerformed":false}\n' \
    "$PROJECT" "$TOPIC_RESOURCE" "$SUBSCRIPTION_RESOURCE" "$PUSH_EMAIL" "$ENDPOINT" "$ENDPOINT"
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || die GCLOUD_REQUIRED
command -v python3 >/dev/null 2>&1 || die PYTHON_REQUIRED

# Capture provider responses without echoing IAM policies or diagnostics. A
# failed read is never treated as a missing resource.
RESULT=''
cloud_read() {
  RESULT="$(gcloud "$@" --project="$PROJECT" --quiet --format=json 2>/dev/null)" || die GCLOUD_READ_FAILED
}
cloud_write() {
  [[ "$MODE" == '--apply' ]] || die APPLY_REQUIRED
  WRITE_ATTEMPTED=true
  RESULT="$(gcloud "$@" --project="$PROJECT" --quiet --format=json 2>/dev/null)" || die GCLOUD_WRITE_FAILED
}

CHECKS="$(cat <<'PY'
import json, re, sys

PROJECT = 'ennearock-web'
TOPIC = 'projects/ennearock-web/topics/solace-play-rtdn'
SUB = 'projects/ennearock-web/subscriptions/solace-play-rtdn-push'
EMAIL = 'solace-play-rtdn-push@ennearock-web.iam.gserviceaccount.com'
ENDPOINT = 'https://www.solace-pomodoro.com/api/billing/native/webhooks/google'

def require(condition):
    if not condition:
        raise ValueError()

def one(rows, field, expected):
    require(isinstance(rows, list) and all(isinstance(r, dict) for r in rows))
    matching = [r for r in rows if r.get(field) == expected]
    require(len(matching) <= 1)
    return matching[0] if matching else None

def policy_bindings(policy):
    require(isinstance(policy, dict) and policy.get('version', 1) in (1, 3))
    bindings = policy.get('bindings', [])
    require(isinstance(bindings, list))
    for binding in bindings:
        require(isinstance(binding, dict) and isinstance(binding.get('role'), str))
        require('_withcond_' not in binding['role'])
        require(isinstance(binding.get('members'), list))
        require(all(isinstance(member, str) for member in binding['members']))
    return bindings

try:
    raw = json.load(sys.stdin)
    kind = sys.argv[1]
    if kind == 'project':
        require(isinstance(raw, dict) and raw.get('projectId') == PROJECT)
        require(raw.get('lifecycleState') == 'ACTIVE')
        number = str(raw.get('projectNumber', ''))
        require(re.fullmatch(r'[1-9][0-9]{5,19}', number) is not None)
        print(number)
    elif kind == 'services':
        require(isinstance(raw, list))
        enabled = {r.get('config', {}).get('name') for r in raw if isinstance(r, dict)}
        print('EXISTS' if {'iam.googleapis.com', 'pubsub.googleapis.com'} <= enabled else 'MISSING')
    elif kind == 'account':
        row = one(raw, 'email', EMAIL)
        if row:
            require(row.get('projectId') == PROJECT and row.get('disabled', False) is False)
        print('EXISTS' if row else 'MISSING')
    elif kind == 'topic':
        row = one(raw, 'name', TOPIC)
        if row:
            require(row.get('state', 'ACTIVE') == 'ACTIVE')
            require(not row.get('schemaSettings') and not row.get('ingestionDataSourceSettings'))
            require(not row.get('messageTransforms'))
        print('EXISTS' if row else 'MISSING')
    elif kind == 'subscription':
        row = one(raw, 'name', SUB)
        if row:
            require(row.get('topic') == TOPIC and row.get('ackDeadlineSeconds') == 60)
            require(row.get('state', 'ACTIVE') == 'ACTIVE' and row.get('detached', False) is False)
            push = row.get('pushConfig', {})
            require(isinstance(push, dict) and push.get('pushEndpoint') == ENDPOINT)
            require('noWrapper' not in push)
            token = push.get('oidcToken', {})
            require(token.get('serviceAccountEmail') == EMAIL and token.get('audience') == ENDPOINT)
            attrs = push.get('attributes', {})
            require(isinstance(attrs, dict) and set(attrs) <= {'x-goog-version'})
            require(attrs.get('x-goog-version', 'v1') == 'v1')
            require(not row.get('expirationPolicy', {}).get('ttl'))
            for field in ['filter', 'deadLetterPolicy', 'bigqueryConfig', 'cloudStorageConfig', 'messageTransforms']:
                require(not row.get(field))
        print('EXISTS' if row else 'MISSING')
    elif kind == 'identity':
        require(isinstance(raw, dict) and raw.get('email') == sys.argv[2])
        print('EXISTS')
    elif kind == 'policy':
        role, member = sys.argv[2], sys.argv[3]
        found = False
        for binding in policy_bindings(raw):
            require(binding['role'] not in ['roles/owner', 'roles/editor', 'roles/pubsub.admin', 'roles/pubsub.editor', 'roles/iam.serviceAccountAdmin'])
            if binding['role'] in [role, 'roles/iam.serviceAccountOpenIdTokenCreator']:
                require('condition' not in binding)
                require(set(binding['members']) <= {member})
                if binding['role'] == role and member in binding['members']:
                    found = True
        print('EXISTS' if found else 'MISSING')
    elif kind == 'baseline':
        role = sys.argv[2]
        others = [dict(binding, members=sorted(binding['members'])) for binding in policy_bindings(raw) if binding['role'] != role]
        print(json.dumps(sorted(others, key=lambda b: json.dumps(b, sort_keys=True)), sort_keys=True, separators=(',', ':')))
    else:
        raise ValueError()
except (ValueError, TypeError, KeyError, AttributeError, IndexError):
    sys.exit(1)
PY
)"

inspect() {
  local kind="$1" payload="$2"
  shift 2
  python3 -c "$CHECKS" "$kind" "$@" <<< "$payload" 2>/dev/null || die CONFIGURATION_MISMATCH
}

cloud_read projects describe "$PROJECT"
PROJECT_NUMBER="$(inspect project "$RESULT")" || die PROJECT_MISMATCH
SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"

cloud_read services list --enabled
SERVICES="$(inspect services "$RESULT")" || die CONFIGURATION_MISMATCH
if [[ "$SERVICES" == 'MISSING' ]]; then
  [[ "$MODE" == '--apply' ]] || die REQUIRED_API_DISABLED
  cloud_write services enable iam.googleapis.com pubsub.googleapis.com
  cloud_read services list --enabled
  [[ "$(inspect services "$RESULT")" == 'EXISTS' ]] || die REQUIRED_API_DISABLED
fi

read_account() {
  cloud_read iam service-accounts list --filter="email=$PUSH_EMAIL"
  ACCOUNT_STATE="$(inspect account "$RESULT")" || die CONFIGURATION_MISMATCH
}
read_topic() {
  cloud_read pubsub topics list --filter="name=$TOPIC_RESOURCE"
  TOPIC_STATE="$(inspect topic "$RESULT")" || die CONFIGURATION_MISMATCH
}
read_subscription() {
  cloud_read pubsub subscriptions list --filter="name=$SUBSCRIPTION_RESOURCE"
  SUBSCRIPTION_STATE="$(inspect subscription "$RESULT")" || die CONFIGURATION_MISMATCH
}

# Validate every existing dedicated resource before creating any missing one.
read_account
read_topic
read_subscription

check_policy() {
  local resource_kind="$1" role="$2" member="$3"
  if [[ "$resource_kind" == 'topic' ]]; then
    cloud_read pubsub topics get-iam-policy "$TOPIC"
  else
    cloud_read iam service-accounts get-iam-policy "$PUSH_EMAIL"
  fi
  POLICY_STATE="$(inspect policy "$RESULT" "$role" "$member")" || die IAM_POLICY_CONFLICT
  POLICY_BASELINE="$(inspect baseline "$RESULT" "$role")" || die IAM_POLICY_CONFLICT
}

[[ "$TOPIC_STATE" == 'MISSING' ]] || check_policy topic 'roles/pubsub.publisher' "serviceAccount:$PLAY_PUBLISHER"
[[ "$ACCOUNT_STATE" == 'MISSING' ]] || check_policy account 'roles/iam.serviceAccountTokenCreator' "serviceAccount:$SERVICE_AGENT"

if [[ "$ACCOUNT_STATE" == 'MISSING' ]]; then
  [[ "$MODE" == '--apply' ]] || die PUSH_ACCOUNT_MISSING
  cloud_write iam service-accounts create "$PUSH_ACCOUNT" --display-name='Solace Google Play RTDN'
  # IAM listing can briefly lag a successful creation. Retry only an empty
  # successful read; authorization/provider failures still stop immediately.
  for attempt in 1 2 3 4 5; do
    read_account
    [[ "$ACCOUNT_STATE" == 'EXISTS' ]] && break
    [[ "$attempt" == 5 ]] || sleep 2
  done
  [[ "$ACCOUNT_STATE" == 'EXISTS' ]] || die PUSH_ACCOUNT_READBACK
fi
if [[ "$TOPIC_STATE" == 'MISSING' ]]; then
  [[ "$MODE" == '--apply' ]] || die TOPIC_MISSING
  cloud_write pubsub topics create "$TOPIC" --labels=app=solace,purpose=play-rtdn
  read_topic
  [[ "$TOPIC_STATE" == 'EXISTS' ]] || die TOPIC_READBACK
fi

ensure_policy() {
  local resource_kind="$1" role="$2" member="$3" baseline
  check_policy "$resource_kind" "$role" "$member"
  baseline="$POLICY_BASELINE"
  if [[ "$POLICY_STATE" == 'MISSING' ]]; then
    [[ "$MODE" == '--apply' ]] || die IAM_GRANT_MISSING
    if [[ "$resource_kind" == 'topic' ]]; then
      cloud_write pubsub topics add-iam-policy-binding "$TOPIC" --member="$member" --role="$role"
    else
      cloud_write beta services identity create --service=pubsub.googleapis.com
      [[ "$(inspect identity "$RESULT" "$SERVICE_AGENT")" == 'EXISTS' ]] || die SERVICE_AGENT_MISMATCH
      cloud_write iam service-accounts add-iam-policy-binding "$PUSH_EMAIL" --member="$member" --role="$role" --condition=None
    fi
    check_policy "$resource_kind" "$role" "$member"
  fi
  [[ "$POLICY_STATE" == 'EXISTS' && "$POLICY_BASELINE" == "$baseline" ]] || die IAM_READBACK_MISMATCH
}

ensure_policy topic 'roles/pubsub.publisher' "serviceAccount:$PLAY_PUBLISHER"
ensure_policy account 'roles/iam.serviceAccountTokenCreator' "serviceAccount:$SERVICE_AGENT"

if [[ "$SUBSCRIPTION_STATE" == 'MISSING' ]]; then
  [[ "$MODE" == '--apply' ]] || die SUBSCRIPTION_MISSING
  cloud_write pubsub subscriptions create "$SUBSCRIPTION" --topic="$TOPIC_RESOURCE" \
    --push-endpoint="$ENDPOINT" --push-auth-service-account="$PUSH_EMAIL" \
    --push-auth-token-audience="$ENDPOINT" --ack-deadline=60 --expiration-period=never \
    --min-retry-delay=10s --max-retry-delay=600s
fi

# Independent reads verify resulting resource routing and both minimal grants.
read_account
read_topic
read_subscription
[[ "$ACCOUNT_STATE" == 'EXISTS' && "$TOPIC_STATE" == 'EXISTS' && "$SUBSCRIPTION_STATE" == 'EXISTS' ]] || die RESOURCE_READBACK_MISSING
check_policy topic 'roles/pubsub.publisher' "serviceAccount:$PLAY_PUBLISHER"
[[ "$POLICY_STATE" == 'EXISTS' ]] || die IAM_GRANT_MISSING
check_policy account 'roles/iam.serviceAccountTokenCreator' "serviceAccount:$SERVICE_AGENT"
[[ "$POLICY_STATE" == 'EXISTS' ]] || die IAM_GRANT_MISSING

printf '{"ok":true,"mode":"%s","projectId":"%s","topic":"%s","subscription":"%s","pushServiceAccount":"%s","pushEndpoint":"%s","audience":"%s","configurationVerified":true,"notificationDeliveryVerified":false,"writeAttempted":%s,"purchasesEnabled":false,"deploymentPerformed":false}\n' \
  "${MODE#--}" "$PROJECT" "$TOPIC_RESOURCE" "$SUBSCRIPTION_RESOURCE" "$PUSH_EMAIL" "$ENDPOINT" "$ENDPOINT" "$WRITE_ATTEMPTED"
