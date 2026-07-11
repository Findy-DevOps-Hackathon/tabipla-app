# Security Policy

## 公開リポジトリについて

本リポジトリは Public 公開を想定しています。秘密情報（API キー、DB パスワード、Webhook URL、JWT 署名鍵など）は **コミットしない** でください。

- `.env` / `infra/*/.credentials` は `.gitignore` 対象です
- CI で [gitleaks](https://github.com/gitleaks/gitleaks) による secret scan を実行します
- 公開前チェック: `bash scripts/verify-public-release.sh`（リポジトリ内）
- 本番設定確認: `bash scripts/verify-production-config.sh`（GCP・要 `gcloud auth login`）

## 本番環境の必須対応

Public 化後、リポジトリに含まれる **開発用既定値** が本番で使われていないことを確認してください。

| 項目 | 開発用既定値（コード内） | 本番での要件 |
|---|---|---|
| 管理画面 JWT | `tabipla-dev-admin-secret` | Secret Manager `tabipla-admin-jwt-secret` に独自値を設定 |
| agent 内部トークン | `tabipla-dev-agent-internal-secret` | Secret Manager `tabipla-agent-internal-secret` に独自値を設定（backend-api / agent 共通） |
| 管理ユーザー PW | seed 用環境変数で指定 | Cloud SQL 上でローテーション（`scripts/rotate-admin-password.sh`）。能登半島は Secret Manager `tabipla-admin-noto-password` |

`NODE_ENV=production` では `ADMIN_JWT_SECRET` / `AGENT_INTERNAL_SECRET` 未設定時に backend-api / agent は起動失敗します。

## 報告

脆弱性を見つけた場合は、GitHub の **Private vulnerability report**（Security タブ）またはリポジトリメンテナーへ連絡してください。公開 Issue に秘密情報を貼らないでください。

## 関連ドキュメント

- [docs/public-release-checklist.md](docs/public-release-checklist.md) — Public 化前の運用チェックリスト
