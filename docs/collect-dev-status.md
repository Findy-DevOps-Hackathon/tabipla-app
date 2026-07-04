# Web収集機能 開発状況メモ（引き継ぎ用）

更新: 2026-07-03 / ブランチ: `ikeno/work` / 前提資料: [setup-collect-agent.md](./setup-collect-agent.md)

## 今どこまでできているか（動作確認済み）

- **Web収集機能**: 実装済み。管理画面「Web収集」→ 市区町村指定 → AIが収集 → プレビュー（行内編集可）→ 承認 → PostgreSQL + Elasticsearch 一括登録
- **実測**: 小諸市30件・金沢市10件を収集/登録済み。ES同期・キーワード検索（「滝」→不動の滝）動作確認済み
- **ハルシネーション対策**: 架空都市「findy市」で0件（空配列）を返すことを確認（創作禁止プロンプト + 出口ガード）
- **重複防止**: 3層（収集前に登録済み名を除外リストで渡す / 収集後に名前照合 / 登録直前にDB再照合）
- **47都道府県対応**: 収集ページ・スポット一覧とも都道府県セレクトあり
- **クーポン・蘊蓄機能**: 削除済み（別コミット）

## 別PCでの環境構築（git外の作業）

[setup-collect-agent.md](./setup-collect-agent.md) の手順どおり。要点だけ:

1. `gcloud auth application-default login`（自分のGoogleアカウント。Vertex AI利用権限が必要）
2. `.env` 作成（`.env.example` をコピー）
   - `services/agent/.env`: `GOOGLE_CLOUD_PROJECT` を自分/チームのGCPプロジェクトIDに
   - ポート8080が他プロジェクトと競合する場合: agentの`.env`に `PORT=8081`、
     `apps/admin-web/.env.local` に `VITE_AGENT_PROXY_TARGET=http://localhost:8081`
3. `corepack pnpm install` → `corepack pnpm build` → Docker起動 → `db:migrate` → `seed`
4. スポットデータは管理画面から収集し直すのが早い（DBを引き継ぐ場合は旧PCで
   `docker exec tabipla-dev-postgres pg_dump -U tabipla tabipla > dump.sql`）

## 残タスク（優先度順）

- [ ] **imageUrl / imageAttribution カラム追加**（DB→ES→管理画面フォーム）。
      設計方針: 画像は出所とライセンスをデータで管理（Webからの画像収集は著作権上NG。
      自治体提供・フリー素材・Wikimedia Commons等の合法ルートのみ）
- [ ] **embedding生成**: 収集した新規スポットはベクトル未生成のため、セマンティック検索
      （/search/semantic）の対象外。`GEMINI_API_KEY` を設定して `pnpm -C services/backend-api embed-spots`
      を実行するか、登録時の自動embedding化を実装する
- [ ] **自治体アカウントの地域制限**: 現状どの自治体アカウントでも全国を登録できる。
      backend側で municipalityName による書き込み制限（マルチテナント化）
- [ ] **大規模収集パイプライン**: 1回の収集上限は実質30〜60件。OSM(Overpass)/Wikipediaから
      候補一括取得→LLMは説明文の肉付けのみ、の2段方式でトークン/検索回数制約を突破する構想
- [ ] **再現性**: temperature固定・実行ログ（プロンプト/モデル/生出力）の保存
- [ ] カテゴリ拡張（グルメ・宿泊・体験）・口コミ収集は Phase 2

## 設計判断の記録（なぜこうなっているか）

| 判断 | 理由 |
|---|---|
| Web検索は Gemini 組み込み googleSearch のみ | 自前スクレイピングを構造的に不可能にする（ツールallowlist）。追加APIキーも不要 |
| outputSchema を使わずプロンプトでJSON指示 + zod検証 | Gemini APIの制約でJSON強制モードとツールは併用不可 |
| 説明文は300字強制カット + URL除去 | 著作権ガード（長文丸写しの物理的防止）。プロンプト指示の保険 |
| 管理画面→agent は vite proxy `/agent` 経由 | 同一オリジン化でCORS問題を根絶。ポートは env で差し替え可能 |
| 収集対象は観光地（観光・自然・歴史）のみ | まず観光地で品質を確立してから飲食・宿泊へ広げる |
| 登録は必ず人間の承認後 | 収集データの自動登録経路は作らない（品質・責任の担保） |
