#!/usr/bin/env bash
set -euo pipefail

# ES 接続をローカルから検証する（packages/search-core の ping を利用）。
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CREDS_FILE="$ROOT/infra/elasticsearch/.credentials"
ENV_FILE="$ROOT/services/backend-api/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
if [[ -f "$CREDS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CREDS_FILE"
  set +a
fi

if [[ -z "${ES_NODE:-}" ]]; then
  echo "ES_NODE が未設定です。infra/elasticsearch/setup.sh を実行してください。" >&2
  exit 1
fi

echo "ES_NODE=${ES_NODE}"
pnpm -C "$ROOT/packages/search-core" exec node --input-type=module -e "
import { createElasticsearchClient, pingElasticsearch } from './dist/index.js';
const ok = await pingElasticsearch(createElasticsearchClient());
if (!ok) {
  console.error('Elasticsearch ping failed');
  process.exit(1);
}
const client = createElasticsearchClient();
const count = await client.count({ index: process.env.ES_INDEX ?? 'spots' });
console.log('ping: ok');
console.log('spots count:', count.count);
"
