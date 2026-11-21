import { formatDistanceToNow } from "date-fns";
import { Suspense, lazy, useMemo } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, List, ListItemButton, ListItemText, Paper, Typography } from "@mui/material";
import { usePublicPage, type PublicNotebook } from "../../../hooks/xennote/useXenNote";
import DetailSkeleton from "../../../components/ui/DetailSkeleton";
import EmptyState from "../../../components/ui/EmptyState";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import { railItemSx } from "../../../components/ui/railStyles";
import { useTitle } from "../../../hooks/useTitle";
import { rememberReturnTo } from "../../../utils/returnTo";
import NoteCard from "../../Internal/XenNote/components/NoteCard";
import { pageTitle } from "../../Internal/XenNote/notebook/pageTree";

const PublicPageReader = lazy(() => import("../../Internal/XenNote/editor/PublicPageReader"));

export const LINK_GONE = "This link doesn't work any more. Ask the person who shared it for a new one.";

function ReaderHeader({ name, signedIn }: { name?: string; signedIn: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Box
      sx={{
        px: { xs: 1.5, sm: 3 },
        py: 1.5,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Typography variant="h6" component="span" color="primary.main">
        XenNote
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1, overflowWrap: "anywhere" }}>
        {name ? `${name} · ` : ""}Shared with a link · Read only
      </Typography>
      {signedIn ? (
        <Button component={Link} to="/internal/xennote" size="small" variant="outlined">
          Open XenNote
        </Button>
      ) : (
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            rememberReturnTo(location.pathname + location.search);
            navigate("/login");
          }}
        >
          Sign in
        </Button>
      )}
    </Box>
  );
}

export function SharedPageReader({ token, signedIn }: { token?: string; signedIn: boolean }) {
  const { data, isLoading, isError } = usePublicPage(token);
  const titles = useMemo(() => new Map<string, string>(), []);
  useTitle(data ? pageTitle(data.title) : "Shared page - XenNote");
  return (
    <PageContainer>
      <Paper variant="outlined">
        <ReaderHeader signedIn={signedIn} />
        <Box sx={{ px: { xs: 2, sm: 5 }, py: 3 }}>
          {isLoading ? (
            <DetailSkeleton height={280} />
          ) : data && !isError ? (
            <>
              <PageHeader
                title={pageTitle(data.title)}
                subtitle={
                  data.updated_at ? "Updated " + formatDistanceToNow(data.updated_at, { addSuffix: true }) : undefined
                }
              />
              <Suspense fallback={<DetailSkeleton height={200} />}>
                <PublicPageReader key={data.id} detail={data} titles={titles} onOpenPage={() => undefined} />
              </Suspense>
            </>
          ) : (
            <Alert severity="error">{LINK_GONE}</Alert>
          )}
        </Box>
      </Paper>
    </PageContainer>
  );
}

export function SharedNotebookReader({ data, signedIn }: { data: PublicNotebook; signedIn: boolean }) {
  const { token } = useParams();
  const [params, setParams] = useSearchParams();
  const requested = params.get("page");
  const orderedPages = useMemo(
    () =>
      data.sections.map((section) => {
        const pages = data.pages.filter((page) => page.section_id === section.id);
        const children = new Map<string, typeof pages>();
        for (const page of pages) {
          if (!page.parent_id) continue;
          const siblings = children.get(page.parent_id) ?? [];
          siblings.push(page);
          children.set(page.parent_id, siblings);
        }
        return {
          ...section,
          pages: pages.filter((page) => !page.parent_id).flatMap((page) => [page, ...(children.get(page.id) ?? [])]),
        };
      }),
    [data.pages, data.sections],
  );
  const first = orderedPages.find((section) => section.pages.length)?.pages[0]?.id;
  const selected = requested === "notes" && data.notes.length ? null : (requested ?? first);
  const publicId = selected && data.pages.some((p) => p.id === selected) ? selected : undefined;
  const { data: detail, isLoading, isError } = usePublicPage(publicId ? token : undefined, publicId);
  const titles = useMemo(() => new Map(data.pages.map((page) => [page.id, page.title])), [data.pages]);
  const openPage = (id: string) => setParams({ page: id });
  return (
    <PageContainer>
      <Paper variant="outlined">
        <ReaderHeader name={data.notebook.name} signedIn={signedIn} />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "260px minmax(0, 1fr)" } }}>
          <Box
            component="nav"
            aria-label="Notebook pages"
            sx={{
              px: 1.5,
              py: 1.5,
              borderRight: { md: 1 },
              borderBottom: { xs: 1, md: 0 },
              borderColor: "divider",
              maxHeight: { xs: 220, md: "none" },
              overflowY: "auto",
            }}
          >
            {orderedPages
              .filter((section) => section.pages.length)
              .map((section) => (
                <Box key={section.id} sx={{ mb: 1 }}>
                  <Typography component="h2" variant="overline" color="text.secondary" sx={{ pl: 1.5 }}>
                    {section.name}
                  </Typography>
                  <List disablePadding>
                    {section.pages.map((page) => (
                      <ListItemButton
                        key={page.id}
                        selected={page.id === selected}
                        aria-current={page.id === selected ? "page" : undefined}
                        onClick={() => openPage(page.id)}
                        sx={{ ...railItemSx, pl: page.parent_id ? 3.5 : 1.5 }}
                      >
                        <ListItemText primary={pageTitle(page.title)} />
                      </ListItemButton>
                    ))}
                  </List>
                </Box>
              ))}
            {!!data.notes.length && (
              <ListItemButton selected={!selected} onClick={() => setParams({ page: "notes" })} sx={railItemSx}>
                <ListItemText primary="Notes" />
              </ListItemButton>
            )}
          </Box>
          <Box sx={{ px: { xs: 2, sm: 5 }, py: 3, minHeight: 280 }}>
            {!selected && data.notes.length ? (
              <>
                <PageHeader title="Notes" />
                {data.notes.map((note) => (
                  <NoteCard key={note._id} note={note} />
                ))}
              </>
            ) : !selected ? (
              <EmptyState title="No pages yet" description="This shared notebook is empty." />
            ) : isLoading ? (
              <DetailSkeleton height={260} />
            ) : detail && !isError ? (
              <>
                <PageHeader
                  title={pageTitle(detail.title)}
                  subtitle={
                    detail.updated_at
                      ? "Updated " + formatDistanceToNow(detail.updated_at, { addSuffix: true })
                      : undefined
                  }
                />
                <Suspense fallback={<DetailSkeleton height={200} />}>
                  <PublicPageReader key={detail.id} detail={detail} titles={titles} onOpenPage={openPage} />
                </Suspense>
              </>
            ) : (
              <Alert severity="error">{LINK_GONE}</Alert>
            )}
          </Box>
        </Box>
      </Paper>
    </PageContainer>
  );
}
