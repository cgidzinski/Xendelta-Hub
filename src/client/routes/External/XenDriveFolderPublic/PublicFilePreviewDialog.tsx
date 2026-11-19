import { Box, Button, CircularProgress, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import ErrorDisplay from "../../../components/ErrorDisplay";
import FilePreview from "../../Internal/XenDrive/components/FilePreview";
import { usePublicFilePreview } from "../../../hooks/xendrive/useXendrive";

interface PublicFilePreviewDialogProps {
  token: string;
  /** The file being looked at, or null when the dialog is closed. */
  file: { _id: string; name: string } | null;
  password?: string;
  onClose: () => void;
  onDownload: (fileId: string) => void;
}

/** A file in a shared folder, shown in the page: pictures, PDFs, video, audio and text, without downloading it. */
export default function PublicFilePreviewDialog({
  token,
  file,
  password,
  onClose,
  onDownload,
}: PublicFilePreviewDialogProps) {
  const { data, isLoading, isError, error, refetch } = usePublicFilePreview(token, file?._id, password);
  return (
    <ResponsiveDialog
      open={!!file}
      onClose={onClose}
      maxWidth="md"
      title={
        <Typography component="span" variant="h6" noWrap sx={{ minWidth: 0 }}>
          {file?.name}
        </Typography>
      }
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => file && onDownload(file._id)}>
            Download
          </Button>
        </>
      }
    >
      <Box sx={{ height: { xs: "60vh", sm: "65vh" }, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isLoading ? (
          <CircularProgress />
        ) : isError || !data ? (
          <ErrorDisplay error={error ?? null} title="Couldn't open this file" onRetry={() => refetch()} />
        ) : (
          <FilePreview
            name={data.name}
            mimeType={data.mimeType}
            previewUrl={data.previewUrl}
            posterUrl={data.posterUrl}
            textResult={data.text}
            onDownload={() => file && onDownload(file._id)}
          />
        )}
      </Box>
    </ResponsiveDialog>
  );
}
