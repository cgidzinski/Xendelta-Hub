/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BUGSNAG_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
