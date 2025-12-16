import { Box, Typography, Button } from "@mui/material";
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
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        p: 3,
        ...(fullHeight && {
          minHeight: "50vh",
        }),
      }}
    >
      <ErrorOutlineIcon 
        sx={{ 
          fontSize: 48, 
          color: "error.main",
          opacity: 0.8,
        }} 
      />
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

