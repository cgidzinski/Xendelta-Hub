// Shared row styling for Xensplit list items (activity feed, expenses, balances, members).
// Keeps the bordered "badge row" look consistent across pages.

export const xsCardSx = {
    border: "1px solid",
    borderColor: "divider",
    borderRadius: 2,
    px: 1.25,
    py: 1,
};

export const xsBadgeSx = {
    width: 40,
    height: 40,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
};
