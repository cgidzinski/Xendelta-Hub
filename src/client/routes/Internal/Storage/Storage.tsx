import { Box, Divider, Typography } from "@mui/material";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import { clickableRowProps } from "../../../utils/keyboard";
import { useTitle } from "../../../hooks/useTitle";
import { useStorageAppFiles } from "../../../hooks/storage/useStorage";
import { formatFileSize } from "../../../utils/fileUtils";
import FileTypeIcon from "../XenDrive/components/FileTypeIcon";
import SourceChips from "./components/SourceChips";

const storageFilePath = (fileId: string) => `/internal/storage/file/${fileId}`;

/**
 * Files that apps stored for you (chat attachments, photos on an expense or a note). They count toward your storage but
 * are kept out of My Drive; this is where you see them.
 */
export default function Storage() {
  useTitle("Storage");
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useStorageAppFiles();

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Storage"
        subtitle={
          data && data.count > 0
            ? `${data.count} ${data.count === 1 ? "file" : "files"} · ${formatFileSize(data.size)}`
            : "Files that apps store for you"
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} height={56} />
      ) : isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load these files" onRetry={() => refetch()} />
      ) : !data || data.count === 0 ? (
        <EmptyState
          icon={<AppsOutlinedIcon />}
          title="Nothing here"
          description="Files you send in chat are kept here, not in My Drive."
        />
      ) : (
        data.apps.map((app) => (
          <Box key={app.app} sx={{ mb: 4 }}>
            <SectionLabel>
              {app.label} · {formatFileSize(app.size)}
            </SectionLabel>
            {app.groups.map((group) => (
              <Box key={group.ref} sx={{ mb: 2.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
                  <Typography sx={{ flex: 1, fontWeight: 600 }} noWrap>
                    {group.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {group.count} {group.count === 1 ? "file" : "files"} · {formatFileSize(group.size)}
                  </Typography>
                </Box>
                <Divider />
                {group.files.map((file) => (
                  <Box
                    key={file._id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1,
                      cursor: "pointer",
                      "&:hover": { bgcolor: "action.hover" },
                      "&:focus-visible": { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: -2 },
                    }}
                    {...clickableRowProps(() => navigate(storageFilePath(file._id)))}
                  >
                    <FileTypeIcon mimeType={file.mimeType} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap>{file.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatFileSize(file.size)} · {format(new Date(file.createdAt), "MMM d, yyyy")}
                      </Typography>
                      <SourceChips file={file} showSource={false} />
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        ))
      )}
    </PageContainer>
  );
}
