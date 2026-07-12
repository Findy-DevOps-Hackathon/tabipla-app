# Public 化チェックリスト

リポジトリを Public にする前後で確認する項目です。

## リポジトリ内（自動チェック可）

```bash
bash scripts/verify-public-release.sh
```

- [ ] gitleaks で leak なし
- [ ] `.env` / `infra/*/.credentials` が git 未追跡
- [ ] `LICENSE` / `SECURITY.md` が存在

## 本番シークレット（GCP・値は表示しない）

```bash
# gcloud ログイン済みであること
gcloud auth login
gcloud config set project tabipla-user-web

# 自動確認（JWT / DB URL / 旧パスワードログイン / アラート）
# 旧パスワード確認は VERIFY_LEGACY_* 環境変数が必要（リポジトリに含めない）
bash scripts/verify-production-config.sh
```

手動で見る場合（**シークレットの値はターミナルに出さない**）:

| 確認項目 | 方法 |
|---|---|
| JWT が開発用でない | 上記スクリプト、または [Secret Manager コンソール](https://console.cloud.google.com/security/secret-manager?project=tabipla-user-web) で `tabipla-admin-jwt-secret` のバージョン履歴を確認（値のコピーは不要） |
| DB が本番向け | スクリプトが `host=/cloudsql/` を確認 |
| API キー制限 | [認証情報](https://console.cloud.google.com/apis/credentials?project=tabipla-user-web) でキーの「アプリケーションの制限」を確認 |
| 課金アラート | [予算とアラート](https://console.cloud.google.com/billing/budgets) |

- [ ] `tabipla-admin-jwt-secret` が開発用 `tabipla-dev-admin-secret` ではない
- [ ] `tabipla-database-url` が本番 Cloud SQL を指す
- [ ] `tabipla-gemini-api-key` / `tabipla-google-maps-api-key` が設定済み
- [ ] API キーに HTTP リファラまたは IP 制限を設定

## 本番アカウント

**いちばん簡単な確認**: 管理画面 URL で、過去に使っていた seed 既定パスワードが通らないことを確認。

1. https://tabipla-admin-web.web.app を開く
2. 既知の旧パスワードでログインを試す
3. **ログインできたら要変更**（`verify-production-config.sh` も同様に確認可能）

- [ ] 本番管理ユーザーのパスワードが、ローカル seed 用に設定した値のまま公開されていない

## インフラ露出への対策

Public 化により以下がコードから読み取れます。

- GCP プロジェクト ID・Cloud Run サービス名
- Firebase Hosting URL

- [ ] Cloud Monitoring の課金・5xx アラートが有効（`infra/monitoring/`）
- [ ] Agent Platform / Cloud Run のクォータ・予算アラートを設定
- [ ] agent / backend-api の `--allow-unauthenticated` を維持する場合、不正利用を監視

## GitHub 設定

- [ ] リポジトリを Public に変更
- [ ] `DISCORD_WEBHOOK_URL` 等の Secrets が Repository secrets にのみ存在
- [ ] （推奨）Branch protection + required checks（gitleaks / CI）

## 公開後

- [ ] 本番 URL が意図どおり動作するか smoke test
- [ ] 不要になったローカル `.env` に本番キーが残っていないか確認
