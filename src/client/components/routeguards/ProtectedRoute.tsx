import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Box, CircularProgress, Typography } from "@mui/material";
import { clearReturnTo, locationPath, rememberReturnTo } from "../../utils/returnTo";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // A signed-out visitor who is turned away keeps the address (query included) for after they sign in; once someone
  // is signed in and reaching protected pages, a stale one is dropped.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) clearReturnTo();
    else rememberReturnTo(locationPath(location));
  }, [isAuthenticated, isLoading, location]);

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 2,
        }}
      >
        <CircularProgress size={40} />
        <Typography variant="body1" color="text.secondary">
          Checking authentication...
        </Typography>
      </Box>
    );
  }
  // If not authenticated, redirect to landing page with return url
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // If authenticated, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;
