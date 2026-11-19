import { useNavigate, useParams } from "react-router-dom";
import { Box, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import PageContainer from "../../../components/ui/PageContainer";
import SectionLabel from "../../../components/ui/SectionLabel";
import { useTitle } from "../../../hooks/useTitle";
import { openOriginalStorageFile, useStorageFile, useStorageFileText } from "../../../hooks/storage/useStorage";
import { formatFileSize } from "../../../utils/fileUtils";
import FilePreview from "../XenDrive/components/FilePreview";
import SourceChips from "./components/SourceChips";
import { KIND_LABEL, fileKindOf } from "../XenDrive/lib/fileKind";

/** One app-stored file: a preview and its details. It can be looked at here, not downloaded or deleted. */
export default function StorageFile() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, isError, error, refetch } = useStorageFile(fileId);

  const file = data?.file;
  const kind = file ? fileKindOf(file.mimeType) : "file";
  const isText = kind === "text";
  const { data: textData } = useStorageFileText(fileId, isText);
  useTitle(file ? `Storage - ${file.name}` : "Storage - File");

  const openOriginal = async () => {
    if (!file) return;
    try {
      await openOriginalStorageFile(file._id);
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't open the original", { variant: "error" });
    }
  };

  if (isError) {
    return (
      <PageContainer width="narrow">
        <ErrorDisplay error={error ?? null} title="Couldn't load this file" onRetry={() => refetch()} />
      </PageContainer>
    );
  }
  if (isLoading || !file) {
    return (
      <PageContainer width="narrow">
        <ListSkeleton />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <IconButton aria-label="Back" onClick={() => navigate("/internal/storage")} edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" component="h1" noWrap sx={{ flex: 1, fontWeight: 500 }}>
          {file.name}
        </Typography>
      </Box>

      <Box
        sx={{
          position: "relative",
          height: { xs: "52vh", md: "60vh" },
          border: 1,
          borderColor: "divider",
          borderRadius: 3,
          bgcolor: "action.hover",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <FilePreview
          name={file.name}
          mimeType={file.mimeType}
          previewUrl={data?.previewUrl ?? null}
          posterUrl={data?.posterUrl}
          textResult={isText ? textData : null}
          onOpenOriginal={kind === "image" ? openOriginal : undefined}
        />
      </Box>

      <Box component="aside" sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 3 }}>
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2, bgcolor: "background.paper" }}>
          <SourceChips file={file} />
          <SectionLabel>Details</SectionLabel>
          {(
            [
              ["Type", KIND_LABEL[kind]],
              ["Size", formatFileSize(file.size)],
              ["Uploaded", format(new Date(file.createdAt), "PPp")],
            ] as const
          ).map(([label, value]) => (
            <Box key={label} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body2" sx={{ textAlign: "right", wordBreak: "break-word" }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </PageContainer>
  );
}
