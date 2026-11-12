import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import SectionLabel from "../../../components/ui/SectionLabel";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTitle } from "../../../hooks/useTitle";
import { downloadFile, useXendriveActions, useXendriveFile } from "../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../utils/fileUtils";
import DriveBreadcrumbs from "./components/DriveBreadcrumbs";
import FileSharePanel from "./components/FileSharePanel";
import SourceChips from "./components/SourceChips";
import FileTypeIcon from "./components/FileTypeIcon";
import FolderDialog from "./components/FolderDialog";
import { KIND_LABEL, fileKindOf } from "./lib/fileKind";
import { XENDRIVE_ROOT, filePath, folderPath } from "./paths";

/** One file, large: a preview, the way to share it, and its details. Left and right arrows step through the folder. */
export default function FileDetail() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { data, isLoading, isError, error, refetch } = useXendriveFile(fileId);
  const { deleteFile, updateFileSettings } = useXendriveActions();
  const [renaming, setRenaming] = useState(false);

  const file = data?.file;
  const neighbors = data?.neighbors;
  const breadcrumb = data?.breadcrumb ?? [];
  const backTo = file?.folder_id ? folderPath(file.folder_id) : XENDRIVE_ROOT;
  const kind = file ? fileKindOf(file.mimeType) : "file";

  useTitle(file ? `XenDrive - ${file.name}` : "XenDrive - File");

  const prevId = neighbors?.prev?._id;
  const nextId = neighbors?.next?._id;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && prevId) navigate(filePath(prevId), { replace: true });
      if (e.key === "ArrowRight" && nextId) navigate(filePath(nextId), { replace: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId, navigate]);

  const remove = async () => {
    if (!file) return;
    const ok = await confirm({
      title: "Delete this file?",
      message: `"${file.name}" will be deleted for good${file.shared ? ", and its link stops working" : ""}.`,
      confirmLabel: "Delete file",
    });
    if (!ok) return;
    deleteFile.mutate(file._id, {
      onSuccess: () => {
        enqueueSnackbar("File deleted", { variant: "success" });
        navigate(backTo);
      },
      onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't delete the file", { variant: "error" }),
    });
  };

  const download = async () => {
    if (!file) return;
    try {
      await downloadFile(file._id);
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't download the file", { variant: "error" });
    }
  };

  if (isError) {
    return (
      <Box sx={{ p: 3 }}>
        <ErrorDisplay error={error ?? null} title="Couldn't load this file" onRetry={() => refetch()} />
      </Box>
    );
  }
  if (isLoading || !file) {
    return (
      <Box sx={{ p: 3 }}>
        <ListSkeleton />
      </Box>
    );
  }

  const previewUrl = data?.previewUrl;

  const stage = () => {
    if (previewUrl && kind === "image")
      return (
        <Box
          component="img"
          src={previewUrl}
          alt={file.name}
          sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
        />
      );
    if (previewUrl && kind === "pdf")
      return (
        <Box component="iframe" src={previewUrl} title={file.name} sx={{ width: "100%", height: "100%", border: 0 }} />
      );
    if (previewUrl && kind === "video")
      return <Box component="video" src={previewUrl} controls sx={{ maxWidth: "100%", maxHeight: "100%" }} />;
    if (previewUrl && kind === "audio")
      return <Box component="audio" src={previewUrl} controls sx={{ width: "80%" }} />;
    return (
      <Box sx={{ textAlign: "center", p: 3 }}>
        <FileTypeIcon mimeType={file.mimeType} size={96} />
        <Typography sx={{ mt: 2, fontWeight: 500 }}>No preview for this kind of file</Typography>
        <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<FileDownloadOutlinedIcon />} onClick={download}>
          Download
        </Button>
      </Box>
    );
  };

  const details = [
    ["Type", KIND_LABEL[kind]],
    ["Size", formatFileSize(file.size)],
    ["Uploaded", format(new Date(file.createdAt), "PPp")],
  ];

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 1.5, md: 3 }, maxWidth: 1400, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <IconButton aria-label="Back" onClick={() => navigate(backTo)} edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" component="h1" noWrap sx={{ flex: 1, fontWeight: 500 }}>
          {file.name}
        </Typography>
        <Button
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={download}
          sx={{ display: { xs: "none", sm: "inline-flex" } }}
        >
          Download
        </Button>
        <Tooltip title="Download">
          <IconButton aria-label="Download" onClick={download} sx={{ display: { sm: "none" } }}>
            <FileDownloadOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Button
          color="error"
          startIcon={<DeleteOutlineIcon />}
          onClick={remove}
          sx={{ display: { xs: "none", sm: "inline-flex" } }}
        >
          Delete
        </Button>
        <IconButton aria-label="Delete" color="error" onClick={remove} sx={{ display: { sm: "none" } }}>
          <DeleteOutlineIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <DriveBreadcrumbs crumbs={breadcrumb} folderTo={folderPath} rootTo={XENDRIVE_ROOT} />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 360px" },
          gap: 3,
          alignItems: "start",
        }}
      >
        <Box>
          <Box
            sx={{
              position: "relative",
              height: { xs: "52vh", md: "68vh" },
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
            {stage()}
          </Box>
          {neighbors && neighbors.total > 1 && (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, mt: 1.5 }}>
              <IconButton
                aria-label="Previous file"
                disabled={!neighbors.prev}
                onClick={() => neighbors.prev && navigate(filePath(neighbors.prev._id), { replace: true })}
              >
                <ChevronLeftIcon />
              </IconButton>
              <Typography variant="body2" color="text.secondary">
                {neighbors.index} of {neighbors.total} in this folder
              </Typography>
              <IconButton
                aria-label="Next file"
                disabled={!neighbors.next}
                onClick={() => neighbors.next && navigate(filePath(neighbors.next._id), { replace: true })}
              >
                <ChevronRightIcon />
              </IconButton>
            </Box>
          )}
        </Box>

        <Box component="aside" sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2, bgcolor: "background.paper" }}>
            {/* A file an app stored stays private: no public link from here. */}
            {file.source ? <SourceChips file={file} /> : <FileSharePanel file={file} />}
          </Box>
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2, bgcolor: "background.paper" }}>
            <SectionLabel>Details</SectionLabel>
            {details.map(([label, value]) => (
              <Box key={label} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ textAlign: "right", wordBreak: "break-word" }}>
                  {value}
                </Typography>
              </Box>
            ))}
            {!file.source && (
              <Button sx={{ mt: 1 }} onClick={() => setRenaming(true)}>
                Rename
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      <FolderDialog
        open={renaming}
        onClose={() => setRenaming(false)}
        kind="file"
        initialName={file.name}
        onSave={async (name) => {
          await updateFileSettings.mutateAsync({ fileId: file._id, settings: { name } });
        }}
      />
    </Box>
  );
}
