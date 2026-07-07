# スポット画像 GCS + CDN

スポット画像を Cloud Run のローカルディスクではなく **Google Cloud Storage** に保存し、公開 URL（必要なら **Cloud CDN**）経由で配信します。

## なぜ必要か

Cloud Run のコンテナ内ディスクは **再デプロイ・スケールで消える** ため、本番では画像が失われます。GCS に置くことで永続化され、CDN 経由で日本ユーザーへの配信も速くなります。

## セットアップ

```bash
# 1. GCS バケット作成（東京リージョン、公開読み取り、Cloud Run 書き込み権限）
bash infra/gcs/setup.sh

# 2. backend-api 再デプロイ（GCS_BUCKET が Cloud Run に渡る）
pnpm --filter @tabipla/backend-api run deploy

# 3. 管理画面から画像を再アップロード
#    → DB の imageUrl が https://storage.googleapis.com/... に更新される
```

GCS バケットのロケーションは作成後に変更できません。既定名のバケットが
`US` など東京以外に既にある場合、`setup.sh` は
`{project}-spot-images-asia-northeast1` を東京リージョン用に作成します。
任意の名前にしたい場合は `GCS_BUCKET=... bash infra/gcs/setup.sh` で新しい
バケット名を指定してください。

### Cloud CDN（任意）

GCS 直 URL でも Google のエッジキャッシュは効きますが、さらに CDN を有効にする場合:

```bash
bash infra/gcs/setup-cdn.sh
pnpm --filter @tabipla/backend-api run deploy
```

`infra/gcs/.credentials` の `GCS_PUBLIC_BASE_URL` が Load Balancer IP に更新されます。

## 環境変数（backend-api）

| 変数 | 説明 |
|------|------|
| `GCS_BUCKET` | バケット名。設定時は GCS に保存（未設定時はローカル `data/uploads/spots`） |
| `GCS_PUBLIC_BASE_URL` | 公開 URL のベース（CDN 利用時）。未設定時は `https://storage.googleapis.com/{bucket}` |
| `GCS_OBJECT_PREFIX` | オブジェクト prefix（既定 `spots`） |

## URL 形式

- **GCS 直**: `https://storage.googleapis.com/{bucket}/spots/{spotId}.jpg`
- **CDN**: `http://{LB_IP}/spots/{spotId}.jpg`（setup-cdn.sh 後）
- **旧パス互換**: `GET /uploads/spots/{filename}` → GCS/CDN へ 301 リダイレクト

## ローカル開発

`GCS_BUCKET` を設定しなければ、従来どおり `services/backend-api/data/uploads/spots` に保存されます。
