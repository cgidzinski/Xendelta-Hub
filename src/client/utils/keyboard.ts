import type { KeyboardEvent } from "react";

/**
 * Props that make a non-button element (a row or tile that holds other buttons, so it can't be a `<button>`) work as a
 * button: focusable, and opened with Enter or Space as well as a click. Keys pressed on a nested control are ignored.
 */
export function clickableRowProps(onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: () => onActivate(),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
