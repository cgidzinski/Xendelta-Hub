import React, { createContext, useContext, useEffect, ReactNode } from "react";
import { useAuthHook, AuthUser } from "../hooks/auth/useAuth";

interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
}

interface SignupData {
  username: string;
  email: string;
  password: string;
}

interface AuthContextType {
  user: User;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  signup: (data: SignupData) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  verifyResetToken: (token: string, email: string) => Promise<{ status: boolean; user?: any; message?: string }>;
  resetPasswordWithToken: (token: string, newPassword: string, email: string) => Promise<{ status: boolean; message?: string }>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const authHook = useAuthHook();

  // Convert AuthUser to User format (id vs _id)
  const user: User | null = authHook.user
    ? {
        id: authHook.user.id,
        username: authHook.user.username,
        email: authHook.user.email,
        avatar: authHook.user.avatar,
      }
    : null;

  useEffect(() => {
    authHook.checkAuth();
  }, []);

  const value: AuthContextType = {
    user: user as User,
    isAuthenticated: authHook.isAuthenticated,
    isLoading: authHook.isLoading,
    login: authHook.login,
    signup: authHook.signup,
    resetPassword: authHook.resetPassword,
    verifyResetToken: authHook.verifyResetToken,
    resetPasswordWithToken: authHook.resetPasswordWithToken,
    logout: authHook.logout,
    checkAuth: authHook.checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
