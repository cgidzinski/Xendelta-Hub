/**
 * API Configuration
 * Centralized API URL helper and axios instance setup
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

/**
 * Get API URL from path
 * Uses relative paths - Vite proxy will handle routing to backend
 */
export const getApiUrl = (path: string): string => {
  // Remove leading slash if present
  let cleanPath = path.startsWith("/") ? path.slice(1) : path;
  // Remove "api/" prefix if already present (to avoid /api/api/...)
  if (cleanPath.startsWith("api/")) {
    cleanPath = cleanPath.slice(4);
  }
  // Use relative path - Vite proxy will forward /api/* to backend
  return `/api/${cleanPath}`;
};

/**
 * Create axios instance with request interceptor for authentication
 */
const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: "", // Use relative URLs, Vite proxy handles routing
  });

  // Request interceptor to add auth token
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = localStorage.getItem("token");
      
      // Add Authorization header if token exists
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Handle FormData - don't set Content-Type for FormData
      // Browser needs to set boundary automatically
      if (config.data instanceof FormData) {
        // Remove Content-Type header to let browser set it with boundary
        if (config.headers) {
          delete config.headers["Content-Type"];
        }
      } else if (config.data && typeof config.data === "object") {
        // Set Content-Type for JSON requests
        if (config.headers && !config.headers["Content-Type"]) {
          config.headers["Content-Type"] = "application/json";
        }
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor for error handling
  instance.interceptors.response.use(
    (response) => {
      return response;
    },
    (error) => {
      // Handle axios errors
      if (error.response) {
        // Server responded with error status
        const { status, data } = error.response;
        
        if (status === 401) {
          // Unauthorized - clear token and redirect
          localStorage.removeItem("token");
          throw new Error("Unauthorized - please log in again");
        } else if (status === 403) {
          throw new Error(data?.message || "You are not authorized to perform this action");
        } else if (status === 404) {
          throw new Error(data?.message || "Resource not found");
        } else if (status === 400 && data?.errors && Array.isArray(data.errors)) {
          // Validation errors
          const errorMessages = data.errors.map((err: { path: string; message: string }) => err.message).join(", ");
          const error = new Error(errorMessages || data.message || "Validation failed");
          (error as any).validationErrors = data.errors;
          throw error;
        } else {
          throw new Error(data?.message || `Request failed: ${error.response.statusText}`);
        }
      } else if (error.request) {
        // Request was made but no response received
        throw new Error("Network error - please check your connection");
      } else {
        // Something else happened
        throw new Error(error.message || "An unexpected error occurred");
      }
    }
  );

  return instance;
};

// Export configured axios instance
export const apiClient = createAxiosInstance();

