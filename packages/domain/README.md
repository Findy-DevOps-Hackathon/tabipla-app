# @tabipla/domain

アプリ横断のドメイン定数・純粋関数を集約するパッケージです。
DB や API に依存せず、カテゴリ・エリア・収集上限などの共通ルールを提供します。

## 提供内容

| モジュール | 内容 |
|---|---|
| `spotCategories.ts` | スポットカテゴリ定義・正規化 |
| `collect.ts` | Web 収集の件数上限 |
| `notoAreas.ts` / `toshinAreas.ts` | 能登・都心エリアのサブリージョン定義 |
| `areasCommon.ts` | 目的地フィルタの共通ユーティリティ |
| `agentCategory.ts` | agent 向けカテゴリ変換 |
| `constants.ts` | 画像プレースホルダー等の定数 |

## 利用者

- `apps/admin-web`
- `apps/user-web`
- `packages/db`
- `services/agent`
- `services/backend-api`

## ビルド

```bash
pnpm -C packages/domain build
```

TypeScript のみで構成され、ランタイム依存はありません。
