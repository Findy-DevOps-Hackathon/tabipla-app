# インフラ監視（GCP Cloud Monitoring）

Cloud Run と Cloud SQL を **Cloud Monitoring** のメトリクスアラートで監視し、**Discord** に通知します。

## セットアップ

```bash
export GOOGLE_CLOUD_PROJECT=tabipla-user-web
export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
bash infra/monitoring/setup-gcp.sh
```

Cloud Function のデプロイに **3〜10 分**かかります。`Deploying Cloud Function` 以降はビルドログが流れるので、そのまま待ってください。

PR 通知（`.github/workflows/discord-pr-notify.yml`）と同じ Webhook URL が使えます。

## 通知の流れ

```text
Cloud Monitoring Alert
  → Pub/Sub
  → Cloud Function (tabipla-discord-notifier)
  → Discord Webhook
```

## 監視対象

| アラート | 条件 |
|---|---|
| `tabipla-cloudrun-5xx-backend-api` | backend-api の 5xx が 5 分間で 3 件超 |
| `tabipla-cloudrun-5xx-agent` | agent の 5xx が 5 分間で 3 件超 |
| `tabipla-cloudsql-high-cpu` | Cloud SQL CPU が 10 分間平均 80% 超 |

詳細調査は [Cloud Logging](https://console.cloud.google.com/logs?project=tabipla-user-web) を使用します。

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `Pub/Sub service account does not exist` | スクリプトを再実行（サービス ID 作成を自動実行） |
| Cloud Function デプロイ失敗 | `eventarc.googleapis.com` が有効か確認して再実行 |

## テスト

Discord 通知の動作確認（Pub/Sub → Cloud Function → Discord）:

```bash
export GOOGLE_CLOUD_PROJECT=tabipla-user-web
bash infra/monitoring/test-alert.sh           # 障害通知
bash infra/monitoring/test-alert.sh recovery  # 復旧通知
```

数秒以内に Discord チャンネルへ届きます。

GCP コンソールから試す場合: [Alert policies](https://console.cloud.google.com/monitoring/alerting?project=tabipla-user-web) → ポリシー → **Test notification**。

## 関連ファイル

- `infra/monitoring/setup-gcp.sh` — セットアップのエントリポイント
- `infra/monitoring/setup_alerts.py` — Monitoring REST API でアラート作成
- `infra/monitoring/discord-notifier/` — Discord 通知用 Cloud Function
- `infra/monitoring/test-alert.sh` — Discord 通知テスト
