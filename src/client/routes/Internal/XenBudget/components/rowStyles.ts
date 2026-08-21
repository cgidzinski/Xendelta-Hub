// Shared row styling for XenBudget list items, extending the app-shell surface tokens
// the same way Xensplit's rowStyles does.

import { cardSx } from "../../../../components/ui/surfaceStyles";

export const xbCardSx = {
    ...cardSx,
    px: 1.25,
    py: 1,
};

export const xbBadgeSx = {
    width: 40,
    height: 40,
    borderRadius: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
};

// An excluded row stays visible so you can see what a rule caught, but must read as not
// counting toward anything.
export const xbExcludedRowSx = {
    opacity: 0.55,
};
