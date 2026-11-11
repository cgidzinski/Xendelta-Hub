import { lazy, Suspense, type ComponentProps, type ComponentType } from "react";
import { Box, CircularProgress } from "@mui/material";

// Every routed page is its own chunk, loaded when the route is first visited, so opening the app
// no longer downloads every sub-app. Use `lazyPage(() => import("./Page"))` in place of a static
// import when registering a route.

const RELOAD_KEY = "chunk-reload-at";

/**
 * A tab left open across a deploy asks for chunk files that no longer exist. Reload once to pick
 * up the new build; the timestamp stops a genuinely broken chunk from reloading in a loop.
 */
function loadWithReload<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await load();
    } catch (error) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
          return await new Promise<T>(() => {}); // never settles; the page is reloading
        }
      } catch {
        // storage unavailable: fall through and surface the error
      }
      throw error;
    }
  };
}

export function PageFallback() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40vh" }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}

export function lazyPage<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Lazy = lazy(loadWithReload(load));
  return function LazyPage(props: P) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Lazy {...(props as ComponentProps<typeof Lazy>)} />
      </Suspense>
    );
  };
}
