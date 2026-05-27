import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    apiClient.get<ApiResponse<{ roles: string[] }>>("/api/auth/roles/verify").catch(console.error);
  }, [isAuthenticated, authLoading, location.pathname]);

  if (authLoading || !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
