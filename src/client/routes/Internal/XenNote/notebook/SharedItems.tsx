import { Link } from "react-router-dom";
import { Box, Chip, List, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import UserAvatar from "../../../../components/user/UserAvatar";
import UserName from "../../../../components/user/UserName";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { useSharedXenNoteItems } from "../../../../hooks/xennote/usePageSharing";

const BOARD = "/internal/xennote";

export default function SharedItems() {
  const { data: groups, isPending, error, refetch } = useSharedXenNoteItems();
  if (isPending) return <ListSkeleton rows={3} height={64} />;
  if (error) return <ErrorDisplay error={error} title="Couldn't load shared items" onRetry={() => refetch()} />;
  if (!groups?.length) {
    return (
      <EmptyState
        icon={<PeopleOutlineIcon />}
        title="Nothing shared yet"
        description="Notebooks and pages people share with you will appear here."
      />
    );
  }
  return (
    <Stack spacing={3}>
      {groups.map(({ sender, items }) => (
        <Box component="section" key={items[0].id}>
          <Typography
            component="h2"
            variant="subtitle2"
            sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.25 }}
          >
            <UserAvatar user={sender ?? undefined} sx={{ width: 32, height: 32, fontSize: 12 }}>
              {sender?.username.slice(0, 1).toUpperCase() ?? "?"}
            </UserAvatar>
            <UserName user={sender} fallback="Unknown sender" />
          </Typography>
          <Paper variant="outlined" sx={{ ...cardSx, overflow: "hidden" }}>
            <List disablePadding>
              {items.map((item, i) => {
                const notebook = item.kind === "notebook";
                return (
                  <ListItemButton
                    key={item.id}
                    component={Link}
                    to={notebook ? `${BOARD}/b/${item.id}` : `${BOARD}/p/${item.id}`}
                    divider={i < items.length - 1}
                    sx={{ gap: 1, minHeight: 64, px: { xs: 1.5, sm: 2 } }}
                  >
                    <ListItemIcon sx={{ minWidth: 24, color: "primary.main" }}>
                      {notebook ? (
                        <MenuBookOutlinedIcon fontSize="small" />
                      ) : (
                        <InsertDriveFileOutlinedIcon fontSize="small" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.title}
                      secondary={`${notebook ? "Notebook" : "Page"} · ${item.role === "viewer" ? "Can view" : "Can edit"}`}
                      slotProps={{ primary: { sx: { fontWeight: 600, overflowWrap: "anywhere" } } }}
                    />
                    {item.status === "new" && <Chip size="small" label="New" color="primary" />}
                    {item.status === "changed" && <Chip size="small" label="Changed" variant="outlined" />}
                    <ChevronRightIcon fontSize="small" color="action" aria-hidden />
                  </ListItemButton>
                );
              })}
            </List>
          </Paper>
        </Box>
      ))}
    </Stack>
  );
}
