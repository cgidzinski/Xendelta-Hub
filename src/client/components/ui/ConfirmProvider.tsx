import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  /** Defaults to "Delete" when destructive, "Confirm" otherwise. */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Colours the confirm button as an error and is the default for deletes. Turn it off for
   * prompts that only risk losing unsaved work.
   */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Replaces window.confirm, which was blocking, unthemeable, and looked like a browser
 * warning rather than part of the app.
 *
 * Resolves false on cancel, backdrop click and Escape, so `if (!(await confirm(...)))
 * return;` reads the same way the old `if (!window.confirm(...)) return;` did.
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside a ConfirmProvider");
  return confirm;
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // Held in a ref rather than state: settling the promise must not depend on a render.
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      // A second call while one is open would strand the first promise unresolved and
      // leave its caller awaiting forever. Settle it as a cancel.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setOptions(next);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const destructive = options?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onClose={() => settle(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{options?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">{options?.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => settle(false)} color="inherit">
            {options?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            onClick={() => settle(true)}
            color={destructive ? "error" : "primary"}
            variant="contained"
            autoFocus
          >
            {options?.confirmLabel ?? (destructive ? "Delete" : "Confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
