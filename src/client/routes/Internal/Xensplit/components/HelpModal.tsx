import { useState } from "react";
import {
    Box,
    Typography,
    Dialog,
    DialogContent,
    IconButton,
    Tabs,
    Tab,
    List,
    ListItem,
    ListItemText,
    useMediaQuery,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";

interface HelpModalProps {
    open: boolean;
    onClose: () => void;
}

interface HelpSection {
    heading: string;
    items: string[];
}

const TABS: { label: string; sections: HelpSection[] }[] = [
    {
        label: "Groups",
        sections: [
            {
                heading: "Creating a group",
                items: [
                    "Tap \"New Group\" on the Groups page, give it a name, and pick a primary currency — this is the currency balances are shown in by default.",
                    "Optionally add secondary currencies your group commonly spends in, so expenses can be logged directly in those currencies too.",
                ],
            },
            {
                heading: "Members",
                items: [
                    "Add and remove members, or transfer group ownership, from the group's Settings tab.",
                    "Each group shows an avatar stack of its members on the Groups list for a quick glance at who's in it.",
                ],
            },
        ],
    },
    {
        label: "Expenses",
        sections: [
            {
                heading: "Adding an expense",
                items: [
                    "From a group, tap \"New Expense\" and fill in a title, amount, currency, and who paid.",
                    "Choose a category to help organize spending — categories show up later in Analytics.",
                    "Attach a receipt image if you want a record of the original purchase.",
                ],
            },
            {
                heading: "Splitting the bill",
                items: [
                    "Equal — the amount is divided evenly across selected members.",
                    "Exact — enter a specific amount for each member; the amounts must add up to the total.",
                    "Percent — assign each member a percentage share of the total.",
                ],
            },
            {
                heading: "Extra options",
                items: [
                    "Put an expense \"on hold\" to record it without having it count toward balances yet.",
                    "Mark an expense \"do not simplify\" to keep it out of debt simplification when settling up.",
                ],
            },
        ],
    },
    {
        label: "Balances & Settlements",
        sections: [
            {
                heading: "Reading balances",
                items: [
                    "The Balances tab shows each member's net position — positive means they're owed money, negative means they owe.",
                    "Balances are broken out per currency if your group uses more than one.",
                ],
            },
            {
                heading: "Settling up",
                items: [
                    "Record a settlement to mark a debt as paid between two members.",
                    "Filter settlements to see all of them, just yours, or just other members'.",
                ],
            },
            {
                heading: "Currency exchanges",
                items: [
                    "If two members trade currencies directly, record it as an exchange rather than an expense so balances stay accurate across currencies.",
                    "You can enter a manual rate or fetch a live exchange rate.",
                ],
            },
        ],
    },
    {
        label: "Analytics",
        sections: [
            {
                heading: "Spending breakdowns",
                items: [
                    "See charts of group spending by category, by member, and by month.",
                    "Stats are shown per currency so mixed-currency groups stay accurate.",
                ],
            },
        ],
    },
    {
        label: "Debt Graph",
        sections: [
            {
                heading: "Visualizing who owes whom",
                items: [
                    "The Explain view draws a web of who owes what to whom.",
                    "Toggle between \"simplified\" debts (fewest transactions to settle everyone up) and \"direct\" debts (the exact expense-by-expense trail).",
                    "Switch currencies to see the graph for each one separately.",
                ],
            },
        ],
    },
    {
        label: "Settings",
        sections: [
            {
                heading: "Group settings",
                items: [
                    "Rename the group or change its image at any time.",
                    "Update the primary or secondary currencies used by the group.",
                    "Add or remove members, or transfer ownership to another member.",
                    "Close a group once it's no longer needed.",
                ],
            },
        ],
    },
];

export default function HelpModal({ open, onClose }: HelpModalProps) {
    const isMobile = useMediaQuery("(max-width:600px)");
    const [tab, setTab] = useState(0);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            fullScreen={isMobile}
            PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 3, pt: 2.5, pb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    How to use Xensplit
                </Typography>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>

            <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ px: 2, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}
            >
                {TABS.map((t) => (
                    <Tab key={t.label} label={t.label} />
                ))}
            </Tabs>

            <DialogContent sx={{ px: 3, py: 2.5 }}>
                {TABS[tab].sections.map((section) => (
                    <Box key={section.heading} sx={{ mb: 2.5, "&:last-of-type": { mb: 0 } }}>
                        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                            {section.heading}
                        </Typography>
                        <List dense disablePadding>
                            {section.items.map((item, i) => (
                                <ListItem key={i} disablePadding sx={{ display: "list-item", listStyleType: "disc", ml: 2.5, py: 0.5 }}>
                                    <ListItemText primary={item} slotProps={{ primary: { variant: "body2" } }} />
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                ))}
            </DialogContent>
        </Dialog>
    );
}
