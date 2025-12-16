import React, { useEffect, useState } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient, getApiUrl } from "../config/api";
import { ApiResponse } from "../types/api";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null); // null = unknown, true/false = known
  const [verificationError, setVerificationError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const verifyAdminRole = async () => {
      if (!isAuthenticated || authLoading) {
        if (isMounted) {
          setIsVerifying(false);
        }
        return;
      }

      const response = await apiClient.get<ApiResponse<{ roles: string[] }>>(getApiUrl("api/auth/roles/verify"));
      const data = response.data.data!;
      if (isMounted) {
        const hasAdminRole = data.roles?.some((role: string) => role.toLowerCase() === "admin") || false;
        setIsAdmin(hasAdminRole);
        // Only set error if we got a successful response but user is not admin
        if (!hasAdminRole) {
          setVerificationError(true);
        } else {
          setVerificationError(false);
        }
      }

      if (isMounted) {
        setIsVerifying(false);
      }
    };

    verifyAdminRole();

    return () => {
      isMounted = false;
    };
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

  // If we've verified the user is not admin, redirect to home
  // Only redirect if isAdmin is explicitly false (not null/unknown)
  if (isAdmin === false && verificationError) {
    return <Navigate to="/" replace />;
  }

  // If we're still verifying or status is unknown, show loading
  if (isAdmin === null) {
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

  // If admin, render the protected content
  return <>{children}</>;
};

export default AdminRoute;

