import { useState } from "react";
import { useParams, useSearchParams, Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Link as MuiLink,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { format } from "date-fns";
import { useTitle } from "../../../hooks/useTitle";
import { usePublicFolder } from "../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../utils/fileUtils";
import FileTypeIcon from "../../Internal/XenDrive/components/FileTypeIcon";
import { fileKindOf } from "../../Internal/XenDrive/lib/fileKind";

type Mode = "list" | "grid";

/** A shared folder, opened from its public link: browse it and everything inside, download files. Read-only. */
export default function XenDriveFolderPublic() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const folderId = params.get("folder");
  const [mode, setMode] = useState<Mode>("list");
  const { data, isLoading, isError, error } = usePublicFolder(token, folderId);

  useTitle(data ? `${data.root.name} - XenDrive` : "Shared folder - XenDrive");

  const here = (id: string) => `/xendrive/f/${token}${id === data?.root._id ? "" : `?folder=${id}`}`;
  const fileHref = (id: string) => `/api/xendrive/public/folder/${token}/files/${id}`;

  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (isError || !data) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="error">
          {(error as Error | null)?.message === "Link not found" || !error
            ? "This link doesn't work any more. Ask the person who shared it for a new one."
            : (error as Error).message}
        </Alert>
      </Container>
    );
  }

  const empty = data.folders.length === 0 && data.files.length === 0;
  const counts = `${data.folders.length} ${data.folders.length === 1 ? "folder" : "folders"} · ${data.files.length} ${data.files.length === 1 ? "file" : "files"}`;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Container maxWidth="md" sx={{ display: "flex", alignItems: "center", gap: 1, py: 1.5 }}>
          <CloudOutlinedIcon color="primary" />
          <Typography sx={{ fontWeight: 600 }}>XenDrive</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
            Shared with you
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: { xs: 3, sm: 5 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} noWrap>
              {data.folder.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {counts}
            </Typography>
          </Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_, v: Mode | null) => v && setMode(v)}
            aria-label="View"
          >
            <ToggleButton value="list" aria-label="List view">
              <ViewListIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="grid" aria-label="Grid view">
              <ViewModuleIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {data.breadcrumb.length > 1 && (
          <Breadcrumbs aria-label="Folder path" sx={{ mb: 2 }}>
            {data.breadcrumb.map((crumb, i) =>
              i === data.breadcrumb.length - 1 ? (
                <Typography key={crumb._id} color="text.primary">
                  {crumb.name}
                </Typography>
              ) : (
                <MuiLink key={crumb._id} component={RouterLink} to={here(crumb._id)} underline="hover" color="inherit">
                  {crumb.name}
                </MuiLink>
              ),
            )}
          </Breadcrumbs>
        )}

        {empty && <Typography color="text.secondary">This folder is empty.</Typography>}

        {mode === "list" ? (
          <Box
            sx={{
              border: empty ? 0 : 1,
              borderColor: "divider",
              borderRadius: 3,
              overflow: "hidden",
              bgcolor: "background.paper",
            }}
          >
            {data.folders.map((folder) => (
              <Box
                key={folder._id}
                component={RouterLink}
                to={here(folder._id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 2,
                  minHeight: 56,
                  color: "text.primary",
                  textDecoration: "none",
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <FileTypeIcon mimeType="folder" />
                <Typography noWrap sx={{ fontWeight: 500 }}>
                  {folder.name}
                </Typography>
              </Box>
            ))}
            {data.files.map((file) => (
              <Box
                key={file._id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 2,
                  minHeight: 56,
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:last-of-type": { borderBottom: 0 },
                }}
              >
                <FileTypeIcon mimeType={file.mimeType} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 500, wordBreak: "break-word" }}>{file.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatFileSize(file.size)} · {format(new Date(file.createdAt), "MMM d, yyyy")}
                  </Typography>
                </Box>
                <Button
                  component="a"
                  href={fileHref(file._id)}
                  download={file.name}
                  startIcon={<DownloadIcon />}
                  variant="outlined"
                  size="small"
                  sx={{ display: { xs: "none", sm: "inline-flex" } }}
                >
                  Download
                </Button>
                <IconButton
                  component="a"
                  href={fileHref(file._id)}
                  download={file.name}
                  aria-label={`Download ${file.name}`}
                  sx={{ display: { sm: "none" } }}
                >
                  <DownloadIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 2 }}>
            {data.folders.map((folder) => (
              <Box
                key={folder._id}
                component={RouterLink}
                to={here(folder._id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.75,
                  height: 56,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 3,
                  bgcolor: "background.paper",
                  color: "text.primary",
                  textDecoration: "none",
                  "&:hover": { borderColor: "text.disabled" },
                }}
              >
                <FileTypeIcon mimeType="folder" size={32} />
                <Typography noWrap sx={{ fontWeight: 500 }}>
                  {folder.name}
                </Typography>
              </Box>
            ))}
            {data.files.map((file) => (
              <Box
                key={file._id}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 3,
                  overflow: "hidden",
                  bgcolor: "background.paper",
                }}
              >
                <Box
                  sx={{
                    height: 120,
                    bgcolor: "action.hover",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {fileKindOf(file.mimeType) === "image" && file.previewUrl ? (
                    <Box
                      component="img"
                      src={file.previewUrl}
                      alt=""
                      loading="lazy"
                      sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <FileTypeIcon mimeType={file.mimeType} size={56} />
                  )}
                </Box>
                <Box sx={{ p: 1.5 }}>
                  <Typography noWrap sx={{ fontWeight: 500 }}>
                    {file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatFileSize(file.size)}
                  </Typography>
                  <Button
                    component="a"
                    href={fileHref(file._id)}
                    download={file.name}
                    startIcon={<DownloadIcon />}
                    size="small"
                    fullWidth
                    variant="outlined"
                    sx={{ mt: 1 }}
                  >
                    Download
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 4, textAlign: "center" }}>
          Shared from XenDrive. You can look and download; you can't change anything.
        </Typography>
      </Container>
    </Box>
  );
}
