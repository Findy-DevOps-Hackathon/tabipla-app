# @tabipla/agent

ADKエージェント層。`@google/adk`（LlmAgent + FunctionTool + InMemoryRunner）で
推薦 / 蘊蓄 / 旅程 / パーソナライズ(スワイプ→制約推論) のエージェントを提供し、Honoで公開する。

## 構成

- `src/agents/` … LlmAgent（recommend / unchiku / itinerary / personalized）＋ run(ask)
- `src/tools/` … FunctionTool（search/travel/weather/unchiku/find_more）＋ `dataSources.ts`（mock↔本物切替）
- `src/personalize.ts` … スワイプ好み学習（決定的）
- `src/fixtures/spots.ts` … 仮データ（後で db/search-core へ）
- `src/sceneSvg.ts` … カード用の生成SVG風景
- `src/server.ts` … API（`/`=スワイプUI, `/dev`=開発パネル, `/v1/*`）

## 起動

```bash
cp .env.example .env   # GOOGLE_CLOUD_PROJECT を自分のGCPに。ADC: gcloud auth application-default login
pnpm --filter @tabipla/agent dev
# → http://localhost:8080/
```

## 本データ結合（TODO）

`src/tools/live.ts` の `searchEs` を `@tabipla/search-core` の `searchCandidateSpots` に結線し、
`USE_MOCK=0` で切替（クエリ埋め込みは agent 側で生成して `embedding` を渡す）。
