import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { Box, Container, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

export default function ErrorPage() {
  const error = useRouteError();

  let errorMessage = "An unexpected error has occurred.";
  let errorStatus: number | undefined;

  if (isRouteErrorResponse(error)) {
    errorStatus = error.status;
    errorMessage = error.statusText || error.data?.message || errorMessage;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 2,
          textAlign: "center",
        }}
      >
        <ErrorOutlineIcon sx={{ fontSize: 64, color: "error.main" }} />
        <Typography variant="h3" component="h1" gutterBottom>
          Oops!
        </Typography>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Sorry, an unexpected error has occurred.
        </Typography>
        {errorStatus && (
          <Typography variant="body2" color="text.secondary">
            Status: {errorStatus}
          </Typography>
        )}
        <Typography variant="body1" color="text.secondary" sx={{ fontStyle: "italic", mt: 2 }}>
          {errorMessage}
        </Typography>
      </Box>
    </Container>
  );
}