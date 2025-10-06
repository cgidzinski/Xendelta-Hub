import React from "react";
import { Box, CircularProgress, Typography } from "@mui/material";

interface LoadingSpinnerProps {
  size?: number;
  color?: "primary" | "secondary" | "inherit";
  message?: string;
  fullScreen?: boolean;
  overlay?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 40,
  color = "primary",
  message,
  fullScreen = false,
  overlay = false,
}) => {
  const spinnerContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        ...(fullScreen && {
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "100vw",
          height: "100vh",
          zIndex: 9999,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }),
        ...(overlay &&
          !fullScreen && {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            zIndex: 1000,
          }),
      }}
    >
      <CircularProgress
        size={size}
        color={color}
        thickness={4}
        sx={{
          animation: "spin 1s linear infinite",
          "@keyframes spin": {
            "0%": {
              transform: "rotate(0deg)",
            },
            "100%": {
              transform: "rotate(360deg)",
            },
          },
        }}
      />
      {message && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            textAlign: "center",
            maxWidth: 200,
            animation: "fadeIn 0.5s ease-in-out",
            "@keyframes fadeIn": {
              "0%": {
                opacity: 0,
                transform: "translateY(10px)",
              },
              "100%": {
                opacity: 1,
                transform: "translateY(0)",
              },
            },
          }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );

  if (fullScreen || overlay) {
    return spinnerContent;
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      {spinnerContent}
    </Box>
  );
};

// Convenience components for common use cases
export const FullScreenSpinner: React.FC<{ message?: string }> = ({ message }) => (
  <LoadingSpinner fullScreen message={message} size={60} />
);

export const OverlaySpinner: React.FC<{ message?: string }> = ({ message }) => (
  <LoadingSpinner overlay message={message} />
);

export const InlineSpinner: React.FC<{ message?: string; size?: number }> = ({ message, size = 24 }) => (
  <LoadingSpinner message={message} size={size} />
);

export const ButtonSpinner: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <CircularProgress size={size} color="inherit" thickness={4} />
);

export default LoadingSpinner;
