import { Box, Skeleton, Typography } from "@mui/material";
import { useXenNotebooks, useXenNotes } from "../../../../hooks/xennote/useXenNote";

export default function XenNoteCardBody() {
  const { data: notes, isLoading } = useXenNotes();
  const { data: notebooks = [] } = useXenNotebooks();

  if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />;

  const list = notes ?? [];
  const recent = list.slice(0, 3);
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
          {list.length}
        </Box>{" "}
        {list.length === 1 ? "note" : "notes"}
        {" · "}
        <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
          {notebooks.length}
        </Box>{" "}
        {notebooks.length === 1 ? "notebook" : "notebooks"}
      </Typography>
      {recent.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No notes yet.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {recent.map((n) => (
            <Typography key={n._id} variant="body2" noWrap>
              {n.title || n.body.split("\n")[0] || n.checklist[0]?.text || n.link.title || n.link.url || "Photo note"}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
