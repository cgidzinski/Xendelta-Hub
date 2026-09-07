import { Breadcrumbs, Link, Typography } from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { SETTINGS_SECTIONS, TAB_LABELS } from "../navigation";

interface BookBreadcrumbsProps {
    bookId: string;
    bookName: string;
}

/**
 * Where you are inside a book.
 *
 * A book nests four levels deep at its worst — books, book, settings, section — and the
 * tab bars only ever show one level at a time, so from inside Settings > Tagging there
 * was nothing on screen naming the book or saying that Tagging sits under Settings.
 *
 * Derived from the URL rather than passed down, so deep links and the back button produce
 * the same trail as clicking there does.
 */
export default function BookBreadcrumbs({ bookId, bookName }: BookBreadcrumbsProps) {
    const { pathname } = useLocation();
    const base = `/internal/xenbudget/books/${bookId}`;

    const segments = pathname.split("/").filter(Boolean);
    const tab = segments.find((s) => s in TAB_LABELS);
    const section = SETTINGS_SECTIONS.find((s) => segments.includes(s.path));

    // On Settings the tab is an ancestor, not the destination, so it stays a link.
    const tabIsLeaf = tab !== undefined && section === undefined;

    return (
        <Breadcrumbs
            separator={<NavigateNextIcon fontSize="small" />}
            aria-label="Breadcrumb"
            sx={{ px: 2, pt: 1, fontSize: 13, "& .MuiBreadcrumbs-separator": { mx: 0.5 } }}
        >
            <Link
                component={RouterLink}
                to="/internal/xenbudget/books"
                underline="hover"
                color="text.secondary"
                sx={{ fontSize: "inherit" }}
            >
                Books
            </Link>

            {tab === undefined ? (
                <Typography color="text.primary" sx={{ fontSize: "inherit" }}>{bookName}</Typography>
            ) : (
                <Link
                    component={RouterLink}
                    to={`${base}/overview`}
                    underline="hover"
                    color="text.secondary"
                    sx={{ fontSize: "inherit" }}
                >
                    {bookName}
                </Link>
            )}

            {tab !== undefined && (
                tabIsLeaf ? (
                    <Typography color="text.primary" sx={{ fontSize: "inherit" }}>
                        {TAB_LABELS[tab]}
                    </Typography>
                ) : (
                    <Link
                        component={RouterLink}
                        to={`${base}/${tab}`}
                        underline="hover"
                        color="text.secondary"
                        sx={{ fontSize: "inherit" }}
                    >
                        {TAB_LABELS[tab]}
                    </Link>
                )
            )}

            {section && (
                <Typography color="text.primary" sx={{ fontSize: "inherit" }}>{section.label}</Typography>
            )}
        </Breadcrumbs>
    );
}
