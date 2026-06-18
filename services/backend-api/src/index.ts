import { buildServer } from "./server.js";

/**
 * backend-api のエントリポイント。
 *
 * 環境変数:
 *   - PORT: 待ち受けポート（既定 3001）
 *   - HOST: 待ち受けホスト（既定 0.0.0.0）
 *   - ES_NODE など Elasticsearch 接続系は search-core 側で解決する。
 */
const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = buildServer();

app
  .listen({ port: PORT, host: HOST })
  .then((address) => {
    app.log.info(`backend-api listening on ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
