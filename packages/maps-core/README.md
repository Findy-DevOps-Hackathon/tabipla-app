# @tabipla/maps-core

Google Maps Routes API を用いた移動時間・距離計算ライブラリです。

`backend-api` の `POST /travel-times` から利用されます。

---

## 機能

- `getTravelTimes(params)` — 拠点 × 上位N件スポット × 移動手段別の所要時間・距離マトリクスを返す
- `DRIVE` / `WALK` / `TRANSIT` / `BICYCLE` に対応（手段は配列で複数指定可）
- `maxDestinations` によるコスト・レイテンシ上限制御（既定 25 件）
- 到達不可・部分失敗を `TravelLeg.status` で表現（握りつぶさない）

---

## 環境変数

| 変数名 | 必須 | 説明 |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | ✅ | Google Maps Routes API キー |

キーの取得: [Google Cloud Console → 認証情報](https://console.cloud.google.com/)  
有効化が必要な API: **Routes API**

> **本番環境では Secret Manager で管理すること。`.env` ファイルにキーをコミットしないこと。**

---

## ローカル起動手順

```bash
# 1. 環境変数を設定
cp .env.example .env
# .env を開いて GOOGLE_MAPS_API_KEY を設定する

# 2. ビルド
pnpm -F @tabipla/maps-core build

# 3. 疎通確認（実際に Routes API を呼び出す）
pnpm -F @tabipla/maps-core verify
```

---

## 使用例

```typescript
import { getTravelTimes } from "@tabipla/maps-core";

const result = await getTravelTimes({
  origin: { lat: 36.331, lon: 138.425 },
  destinations: [
    { lat: 36.329, lon: 138.424 },
    { lat: 36.338, lon: 138.411 },
  ],
  modes: ["DRIVE", "WALK"],
  maxDestinations: 25,
});

for (const leg of result.results.DRIVE ?? []) {
  console.log(
    `destinations[${leg.destinationIndex}]: ${leg.durationSeconds}秒 / ${leg.distanceMeters}m [${leg.status}]`
  );
}
```

---

## backend-api からの呼び出し

```bash
curl -X POST localhost:3001/travel-times \
  -H 'content-type: application/json' \
  -d '{
    "origin": { "lat": 36.331, "lon": 138.425 },
    "destinations": [{ "lat": 36.329, "lon": 138.424 }],
    "modes": ["DRIVE"]
  }'
```

`GOOGLE_MAPS_API_KEY` は `services/backend-api/.env` に設定します。

---

## ディレクトリ構成

```
packages/maps-core/
├── src/
│   ├── client/
│   │   └── routes.client.ts   # Routes API HTTP クライアント
│   ├── types/
│   │   └── travelTimes.ts     # 契約型定義
│   ├── getTravelTimes.ts      # コア関数
│   └── index.ts               # 公開 API
├── scripts/
│   └── verify-routes.mjs      # 疎通確認スクリプト
└── .env.example
```

---

## 注意事項

- Routes API は従量課金。`maxDestinations` を必ず確認して呼び出すこと。
- `TRANSIT` は `departureTime` の指定推奨（未指定だと Routes API が現在時刻を使用）。
- 本番運用前に API キー制限（HTTP リファラ制限 or サーバー IP 制限）を設定すること。
- `getTravelTimes` は1手段の呼び出しが失敗しても他手段の結果を返す（部分成功方針）。

---

## 未実装・将来対応

- キャッシュ（同じ origin×destinations×mode の結果をキャッシュしてAPI呼び出しを削減）
- リトライ・レート制限ハンドリング
- `TRANSIT` の乗り換え詳細（途中経由地の時刻表など）
