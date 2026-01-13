import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

// Types
export interface AuthUser {
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

interface AuthVerifyResponse {
  status: boolean;
  user?: AuthUser;
  token?: string;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  user?: AuthUser;
}

interface SignupResponse {
  success: boolean;
  token?: string;
  user?: AuthUser;
}

interface ResetPasswordResponse {
  status: boolean;
  message?: string;
}

interface VerifyResetTokenResponse {
  status: boolean;
  user?: any;
  message?: string;
}

// Query keys
export const authKeys = {
  all: ["auth"] as const,
  status: () => [...authKeys.all, "status"] as const,
};

// API functions
const checkAuthStatus = async (): Promise<AuthUser | null> => {
  const token = localStorage.getItem("token");
  if (!token) {
    return null;
  }

  // Note: Auth verify endpoint doesn't use standard ApiResponse format
  // It returns { status, user, token } directly
  const response = await apiClient.post<AuthVerifyResponse>("/api/auth/verify");
  const data = response.data;
  
  if (data.status && data.user) {
    // Save new token if provided (automatic refresh)
    if (data.token) {
      localStorage.setItem("token", data.token);
    }
    // Convert user from API format (may have _id) to AuthUser format (id)
    const user = data.user;
    return {
      id: user.id || (user as any)._id || "",
      username: user.username || "",
      email: user.email || "",
      avatar: user.avatar || "",
    };
  } else {
    localStorage.removeItem("token");
    return null;
  }
};

const loginUser = async (username: string, password: string): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>("/api/auth/login", {
    username,
    password,
  });

  const data = response.data;
  
  if (data.success && data.token && data.user) {
    localStorage.setItem("token", data.token);
  }
  
  return data;
};

const signupUser = async (signupData: SignupData): Promise<SignupResponse> => {
  const response = await apiClient.post<SignupResponse>("/api/auth/signup", signupData);

  const data = response.data;
  
  if (data.success && data.token && data.user) {
    localStorage.setItem("token", data.token);
  }
  
  return data;
};

const resetPasswordRequest = async (email: string): Promise<boolean> => {
  await apiClient.post("/api/auth/forgot-password", { email });
  return true;
};

const verifyResetTokenRequest = async (token: string, email: string): Promise<VerifyResetTokenResponse> => {
  const response = await apiClient.post<VerifyResetTokenResponse>("/api/auth/verify-reset-token", {
    token,
    email,
  });
  return response.data;
};

const resetPasswordWithTokenRequest = async (
  token: string,
  newPassword: string,
  email: string
): Promise<ResetPasswordResponse> => {
  const response = await apiClient.post<ResetPasswordResponse>("/api/auth/reset-password", {
    token,
    newPassword,
    email,
  });
  return response.data;
};

// Hooks
export const useAuthHook = () => {
  const queryClient = useQueryClient();

  // Query for checking auth status
  const {
    data: user,
    isLoading,
    refetch: checkAuth,
  } = useQuery({
    queryKey: authKeys.status(),
    queryFn: checkAuthStatus,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation for login
  const { mutateAsync: loginMutation } = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      loginUser(username, password),
    onSuccess: (data) => {
      if (data.success && data.user) {
        // Clear all queries first to remove any previous user's data
        queryClient.clear();
        
        // Convert user to AuthUser format
        const authUser: AuthUser = {
          id: data.user.id || (data.user as any)._id || "",
          username: data.user.username || "",
          email: data.user.email || "",
          avatar: data.user.avatar || "",
        };
        queryClient.setQueryData(authKeys.status(), authUser);
      }
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for signup
  const { mutateAsync: signupMutation } = useMutation({
    mutationFn: signupUser,
    onSuccess: (data) => {
      if (data.success && data.user) {
        // Clear all queries first to remove any previous user's data
        queryClient.clear();
        
        // Convert user to AuthUser format
        const authUser: AuthUser = {
          id: data.user.id || (data.user as any)._id || "",
          username: data.user.username || "",
          email: data.user.email || "",
          avatar: data.user.avatar || "",
        };
        queryClient.setQueryData(authKeys.status(), authUser);
      }
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for reset password
  const { mutateAsync: resetPasswordMutation } = useMutation({
    mutationFn: resetPasswordRequest,
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for verify reset token
  const { mutateAsync: verifyResetTokenMutation } = useMutation({
    mutationFn: ({ token, email }: { token: string; email: string }) =>
      verifyResetTokenRequest(token, email),
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for reset password with token
  const { mutateAsync: resetPasswordWithTokenMutation } = useMutation({
    mutationFn: ({ token, newPassword, email }: { token: string; newPassword: string; email: string }) =>
      resetPasswordWithTokenRequest(token, newPassword, email),
    onError: () => {
      // Error handled by mutation error state
    },
  });

  const logout = () => {
    localStorage.removeItem("token");
    // Set auth status to null first (this updates isAuthenticated to false)
    queryClient.setQueryData(authKeys.status(), null);
    // Remove all queries except auth to clear cached user data
    const allQueries = queryClient.getQueryCache().getAll();
    const authKey = authKeys.status();
    allQueries.forEach((query) => {
      // Compare query keys - if it's not the auth query, remove it
      if (JSON.stringify(query.queryKey) !== JSON.stringify(authKey)) {
        queryClient.removeQueries({ queryKey: query.queryKey });
      }
    });
    // Force a refetch/invalidation of the auth query to ensure re-render
    // But since there's no token, it will return null
    queryClient.invalidateQueries({ queryKey: authKeys.status() });
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    const result = await loginMutation({ username, password });
    return result.success || false;
  };

  const signup = async (data: SignupData): Promise<boolean> => {
    const result = await signupMutation(data);
    return result.success || false;
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    return await resetPasswordMutation(email);
  };

  const verifyResetToken = async (token: string, email: string): Promise<VerifyResetTokenResponse> => {
    return await verifyResetTokenMutation({ token, email });
  };

  const resetPasswordWithToken = async (
    token: string,
    newPassword: string,
    email: string
  ): Promise<ResetPasswordResponse> => {
    return await resetPasswordWithTokenMutation({ token, newPassword, email });
  };

  return {
    user: user || null,
    isAuthenticated: !!user,
    isLoading,
    login,
    signup,
    resetPassword,
    verifyResetToken,
    resetPasswordWithToken,
    logout,
    checkAuth: async () => {
      await checkAuth();
    },
  };
};
