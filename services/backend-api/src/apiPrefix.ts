import type { FastifyInstance, HTTPMethods, RouteOptions } from "fastify";

const MIRROR_METHODS = new Set<HTTPMethods>(["DELETE", "GET", "PATCH", "POST", "PUT", "OPTIONS"]);

/**
 * Firebase Hosting の `/api/**` rewrite 用。
 * 各ルートを `/api` プレフィックス付きでも登録する（onRoute で自動ミラー）。
 */
export function registerApiMirrorRoutes(app: FastifyInstance): void {
  app.addHook("onRoute", (routeOptions) => {
    const url = routeOptions.url;
    if (url.startsWith("/api/") || url === "/api") return;
    if (routeOptions.method === "HEAD") return;
    const method = routeOptions.method;
    if (
      Array.isArray(method)
        ? !method.every((m) => MIRROR_METHODS.has(m))
        : !MIRROR_METHODS.has(method)
    ) {
      return;
    }

    const mirrorUrl = url === "/" ? "/api" : `/api${url}`;
    const mirror: RouteOptions = {
      ...routeOptions,
      url: mirrorUrl,
    };
    app.route(mirror);
  });
}

/** 管理 API 判定（/api プレフィックス付きリクエストにも対応）。 */
export function normalizeApiPath(url: string): string {
  const path = url.split("?")[0] ?? url;
  if (path.startsWith("/api/")) return path.slice(4);
  if (path === "/api") return "/";
  return path;
}
