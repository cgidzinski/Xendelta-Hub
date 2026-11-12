import { useParams, useSearchParams, Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardActionArea,
  CircularProgress,
  Container,
  Link as MuiLink,
  Typography,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import { format } from "date-fns";
import { useTitle } from "../../../hooks/useTitle";
import { usePublicFolder } from "../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../utils/fileUtils";

/** A shared folder, opened from its public link: browse it and everything inside, download files. Read-only. */
export default function XenDriveFolderPublic() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const folderId = params.get("folder");
  const { data, isLoading, isError, error } = usePublicFolder(token, folderId);

  useTitle(data ? `${data.root.name} - XenDrive` : "Shared folder - XenDrive");

  const here = (id: string) => `/xendrive/f/${token}${id === data?.root._id ? "" : `?folder=${id}`}`;

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

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }} noWrap>
        {data.root.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Shared folder
      </Typography>

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

      {empty && <Typography color="text.secondary">This folder is empty.</Typography>}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {data.folders.map((folder) => (
          <Card key={folder._id} variant="outlined">
            <CardActionArea component={RouterLink} to={here(folder._id)} sx={{ p: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <FolderIcon color="primary" />
                <Typography noWrap sx={{ fontWeight: 500 }}>
                  {folder.name}
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        ))}

        {data.files.map((file) => (
          <Card key={file._id} variant="outlined">
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5 }}>
              <InsertDriveFileOutlinedIcon color="action" />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 500, wordBreak: "break-word" }}>{file.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(file.size)} · {format(new Date(file.createdAt), "MMM d, yyyy")}
                </Typography>
              </Box>
              <Button
                component="a"
                href={`/api/xendrive/public/folder/${token}/files/${file._id}`}
                download={file.name}
                startIcon={<DownloadIcon />}
                variant="outlined"
                size="small"
              >
                Download
              </Button>
            </Box>
          </Card>
        ))}
      </Box>
    </Container>
  );
}
