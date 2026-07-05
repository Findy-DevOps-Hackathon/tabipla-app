/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_AGENT_PROXY_TARGET?: string;
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
