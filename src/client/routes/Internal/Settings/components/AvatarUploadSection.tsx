import { Avatar, Button, Stack, Typography } from "@mui/material";
import SectionCard from "../../../../components/ui/SectionCard";

interface AvatarUploadSectionProps {
  selectedFile: File | null;
  filePreviewUrl: string | null;
  /** The photo saved on the account, shown until another one is picked. */
  avatarUrl: string | null;
  isUploading: boolean;
  isUploadingAvatar: boolean;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
}

/** Pick a new profile photo, see it before it is saved, then upload it. */
export default function AvatarUploadSection({
  selectedFile,
  filePreviewUrl,
  avatarUrl,
  isUploading,
  isUploadingAvatar,
  onFileSelect,
  onUpload,
}: AvatarUploadSectionProps) {
  const busy = isUploading || isUploadingAvatar;
  return (
    <SectionCard title="Photo" description="Shown next to your name. JPG, PNG, GIF or WebP, up to 5 MB.">
      <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
        <Avatar src={filePreviewUrl ?? avatarUrl ?? undefined} sx={{ width: 72, height: 72, borderRadius: 2 }} />
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" component="label" disabled={busy}>
            Choose a photo
            <input
              type="file"
              hidden
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              onChange={onFileSelect}
            />
          </Button>
          <Button variant="contained" onClick={onUpload} disabled={!selectedFile || busy}>
            {busy ? "Uploading..." : "Upload"}
          </Button>
        </Stack>
      </Stack>
      {selectedFile && (
        <Typography variant="caption" color="text.secondary">
          {selectedFile.name} · {(selectedFile.size / 1024).toFixed(0)} KB — press Upload to use it.
        </Typography>
      )}
    </SectionCard>
  );
}
