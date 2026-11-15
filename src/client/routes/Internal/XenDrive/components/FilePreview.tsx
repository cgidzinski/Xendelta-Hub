import { Box, Button, Typography } from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fileKindOf } from "../lib/fileKind";
import FileTypeIcon from "./FileTypeIcon";

export interface TextPreviewResult {
  text: string;
  /** The file is longer than the first 256 KB the page shows. */
  truncated: boolean;
}

interface FilePreviewProps {
  name: string;
  mimeType: string;
  /** A short-lived link to show the file in the page, for images, PDFs, video and audio. */
  previewUrl: string | null;
  /** For videos with a poster: the picture shown before it plays. */
  posterUrl?: string | null;
  /** The first slice of a text-like file, when there is one. */
  textResult?: TextPreviewResult | null;
  onDownload: () => void;
  /** Opens the original at full size (images show a smaller rendition in the page). */
  onOpenOriginal?: () => void;
}

const mono = { whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.85rem", m: 0 } as const;

/** A text file, shown as code, rendered Markdown, or a table (CSV), whatever its kind is. */
function TextPreview({ mimeType, result }: { mimeType: string; result: TextPreviewResult }) {
  const truncated = result.truncated && (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
      Showing the first 256 KB
    </Typography>
  );

  if (mimeType.toLowerCase().includes("csv")) {
    const rows = result.text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(0, 200)
      .map((line) => line.split(","));
    if (rows.length === 0) return <Typography>This CSV is empty.</Typography>;
    const [head, ...body] = rows;
    return (
      <Box sx={{ width: "100%", height: "100%", overflow: "auto", textAlign: "left" }}>
        <Box component="table" sx={{ borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <Box component="thead">
            <Box component="tr">
              {head.map((cell, i) => (
                <Box key={i} component="th" sx={{ border: 1, borderColor: "divider", p: 1, fontWeight: 600 }}>
                  {cell}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {body.map((row, r) => (
              <Box key={r} component="tr">
                {row.map((cell, c) => (
                  <Box key={c} component="td" sx={{ border: 1, borderColor: "divider", p: 1 }}>
                    {cell}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
        {truncated}
      </Box>
    );
  }

  if (mimeType.toLowerCase().includes("markdown")) {
    return (
      <Box sx={{ width: "100%", height: "100%", overflow: "auto", textAlign: "left", p: 2 }}>
        <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>
          {result.text}
        </ReactMarkdown>
        {truncated}
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", height: "100%", overflow: "auto", textAlign: "left", p: 2 }}>
      <Typography component="pre" sx={mono}>
        {result.text}
      </Typography>
      {truncated}
    </Box>
  );
}

/**
 * What a file looks like in the page without downloading it: images, PDFs, video and audio use a signed link, text-like
 * files show their contents, and everything else gets its icon. Shared by XenDrive's file page and the storage viewer's.
 */
export default function FilePreview({
  name,
  mimeType,
  previewUrl,
  posterUrl,
  textResult,
  onDownload,
  onOpenOriginal,
}: FilePreviewProps) {
  const kind = fileKindOf(mimeType);

  if (previewUrl && kind === "image")
    return (
      <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
        <Box
          component="img"
          src={previewUrl}
          alt={name}
          sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
        {onOpenOriginal && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<OpenInNewIcon />}
            onClick={onOpenOriginal}
            sx={{ position: "absolute", right: 12, bottom: 12, bgcolor: "background.paper" }}
          >
            Open original
          </Button>
        )}
      </Box>
    );
  if (previewUrl && kind === "pdf")
    return <Box component="iframe" src={previewUrl} title={name} sx={{ width: "100%", height: "100%", border: 0 }} />;
  if (previewUrl && kind === "video")
    return (
      <Box
        component="video"
        src={previewUrl}
        poster={posterUrl ?? undefined}
        controls
        sx={{ maxWidth: "100%", maxHeight: "100%" }}
      />
    );
  if (previewUrl && kind === "audio") return <Box component="audio" src={previewUrl} controls sx={{ width: "80%" }} />;

  if (textResult && kind === "text") return <TextPreview mimeType={mimeType} result={textResult} />;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", p: 3 }}>
      <FileTypeIcon mimeType={mimeType} size={96} />
      <Typography sx={{ mt: 2, fontWeight: 500 }}>No preview for this kind of file</Typography>
      <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<FileDownloadOutlinedIcon />} onClick={onDownload}>
        Download
      </Button>
    </Box>
  );
}
