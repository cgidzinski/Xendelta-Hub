/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BUGSNAG_API_KEY?: string;
  readonly VITE_BUGSNAG_RELEASE_STAGE?: string;
  readonly VITE_BUGSNAG_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
