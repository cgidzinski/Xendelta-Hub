import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useLocalStorageState } from "../useLocalStorageState";

// The notebook view (sections and pages) is being built in stages, and until notebooks are converted it would show an
// empty notebook where the notes still are. So it is opt-in: open XenNote with `?pages=on` (or `?pages=off`) and the
// choice is remembered in this browser. The flag and everything that reads it are removed when the migration ships.

const KEY = "xennote_pages";
const isFlag = (v: unknown): v is boolean => typeof v === "boolean";

/** What `?pages=` asks for: true for "on", false for "off", null for anything else (leave the choice alone). */
export function flagFromParam(value: string | null): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

/** Whether notebooks open as sections and pages. Reading `?pages=on|off` sets it and tidies the address. */
export function useNotebookPagesFlag(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useLocalStorageState<boolean>(KEY, false, isFlag);
  const [params, setParams] = useSearchParams();
  const asked = flagFromParam(params.get("pages"));
  useEffect(() => {
    if (asked === null) return;
    setOn(asked);
    setParams(
      (p) => {
        p.delete("pages");
        return p;
      },
      { replace: true },
    );
  }, [asked, setOn, setParams]);
  return [asked ?? on, setOn];
}
