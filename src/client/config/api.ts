/**
 * API Configuration
 * Centralized axios instance setup with authentication and error handling
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { Bugsnag } from "./bugsnag";

/**
 * Create axios instance with request interceptor for authentication
 */
const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: "", // Use relative URLs, Vite proxy handles routing
    timeout: 20000, // a hung request must eventually reject, not hang callers forever
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
      const reportError = (err: Error, status?: number) => {
        Bugsnag.notify(err, (event) => {
          event.addMetadata("request", {
            url: error.config?.url,
            method: error.config?.method,
            status,
          });
        });
      };

      // Handle axios errors
      if (error.response) {
        // Server responded with error status
        const { status, data } = error.response;

        if (status === 401) {
          // Unauthorized - clear token and redirect. Routine token-expiry flow, not a bug,
          // so it's not reported to Bugsnag.
          localStorage.removeItem("token");
          throw new Error("Unauthorized - please log in again");
        } else if (status === 403) {
          const err = new Error(data?.message || "You are not authorized to perform this action");
          reportError(err, status);
          throw err;
        } else if (status === 404) {
          const err = new Error(data?.message || "Resource not found");
          reportError(err, status);
          throw err;
        } else if (status === 400 && data?.errors && Array.isArray(data.errors)) {
          // Validation errors
          const errorMessages = data.errors.map((err: { path: string; message: string }) => err.message).join(", ");
          const err = new Error(errorMessages || data.message || "Validation failed");
          reportError(err, status);
          throw err;
        } else {
          const err = new Error(data?.message || `Request failed: ${error.response.statusText}`);
          reportError(err, status);
          throw err;
        }
      } else if (error.request) {
        // Request was made but no response received
        const err = new Error("Network error - please check your connection");
        reportError(err);
        throw err;
      } else {
        // Something else happened
        const err = new Error(error.message || "An unexpected error occurred");
        reportError(err);
        throw err;
      }
    }
  );

  return instance;
};

// Export configured axios instance
export const apiClient = createAxiosInstance();
