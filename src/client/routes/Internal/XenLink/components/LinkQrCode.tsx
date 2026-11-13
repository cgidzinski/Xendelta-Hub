import { useMemo } from "react";
import { Box, Button, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { QR_BORDER, qrPath, qrSvgFile } from "../qrModules";

/** A QR code for a short link, to scan or print. Always black on white, whatever the theme, so it stays scannable. */
export default function LinkQrCode({ url, name }: { url: string; name: string }) {
  const { count, d } = useMemo(() => qrPath(url), [url]);
  const size = count + QR_BORDER * 2;

  const download = () => {
    const blob = new Blob([qrSvgFile(url)], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "link"}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
      <Box
        role="img"
        aria-label={`QR code for ${url}`}
        sx={{
          width: 132,
          height: 132,
          bgcolor: "common.white",
          borderRadius: 1,
          border: 1,
          borderColor: "divider",
          p: 0,
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" shapeRendering="crispEdges">
          <path transform={`translate(${QR_BORDER} ${QR_BORDER})`} d={d} fill="black" />
        </svg>
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Scan to open the link.
        </Typography>
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={download}>
          Download SVG
        </Button>
      </Box>
    </Box>
  );
}
