import React, { useEffect, useState } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { get } from "../utils/apiClient";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [verificationError, setVerificationError] = useState(false);

  useEffect(() => {
    const verifyAdminRole = async () => {
      if (!isAuthenticated || authLoading) {
        setIsVerifying(false);
        return;
      }

      try {
        const data = await get<{ roles: string[] }>("/api/user/roles/verify");
        setIsAdmin(data.roles?.some((role: string) => role.toLowerCase() === "admin") || false);
      } catch (error) {
        // On error, assume not admin for security
        setIsAdmin(false);
        setVerificationError(true);
      }

      setIsVerifying(false);
    };

    verifyAdminRole();
  }, [isAuthenticated, authLoading]);

  // Show loading spinner while checking authentication or verifying admin status
  if (authLoading || isVerifying) {
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
          Verifying admin access...
        </Typography>
      </Box>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If not admin or verification error, redirect to home
  if (!isAdmin || verificationError) {
    return <Navigate to="/" replace />;
  }

  // If admin, render the protected content
  return <>{children}</>;
};

export default AdminRoute;

