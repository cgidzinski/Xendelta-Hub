/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BUGSNAG_API_KEY?: string;
  readonly VITE_BUGSNAG_RELEASE_STAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
