import { Box, Typography, Button } from "@mui/material";
import { emptyStateSx, emptyStateIconCircleSx } from "./ui/surfaceStyles";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";

interface ErrorDisplayProps {
  error: Error | string | null;
  onRetry?: () => void;
  title?: string;
  fullHeight?: boolean;
}

/**
 * Standardized error display component
 * Used consistently across the application for error states
 */
export default function ErrorDisplay({ 
  error, 
  onRetry, 
  title = "Something went wrong",
  fullHeight = false 
}: ErrorDisplayProps) {
  const errorMessage = error instanceof Error ? error.message : error || "An unexpected error occurred";

  return (
    <Box
      sx={{
        ...emptyStateSx,
        ...(fullHeight && {
          minHeight: "50vh",
          justifyContent: "center",
        }),
      }}
    >
      <Box sx={emptyStateIconCircleSx}>
        <ErrorOutlineIcon sx={{ fontSize: 32, color: "error.main" }} />
      </Box>
      <Typography variant="h6" component="h2" color="text.primary">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 400 }}>
        {errorMessage}
      </Typography>
      {onRetry && (
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={onRetry}
          sx={{ mt: 1 }}
        >
          Try Again
        </Button>
      )}
    </Box>
  );
}

