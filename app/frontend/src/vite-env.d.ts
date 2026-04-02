/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_COLLABORATION?: string;
  readonly VITE_COLLABORATION_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
