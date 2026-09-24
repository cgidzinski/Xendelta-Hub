/**
 * API Configuration
 * Centralized axios instance setup with authentication and error handling
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { Bugsnag } from "./bugsnag";

/**
 * Marks an Error with the request context a caller needs to decide whether (and how) to
 * report it. This interceptor itself never reports to Bugsnag — it fires on every retry
 * attempt, so reporting from here would flag a blip that self-heals on retry #2 just as
 * loudly as a request that never recovers. Callers report via `reportApiError` below: react-query
 * consumers wire it into QueryCache/MutationCache's onError (fires once, only after retries are
 * exhausted); one-off calls outside react-query (no retry to wait out) call it directly.
 */
export interface ApiError extends Error {
  status?: number;
  requestUrl?: string;
  requestMethod?: string;
}

function makeApiError(message: string, error: any, status?: number): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.requestUrl = error.config?.url;
  err.requestMethod = error.config?.method;
  return err;
}

export function reportApiError(error: unknown): void {
  const apiError = error as ApiError;
  if (apiError?.status === 401) return; // routine token expiry, not a bug
  Bugsnag.notify(error instanceof Error ? error : new Error(String(error)), (event) => {
    event.addMetadata("request", {
      url: apiError?.requestUrl,
      method: apiError?.requestMethod,
      status: apiError?.status,
    });
  });
}

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
      // Handle axios errors
      if (error.response) {
        // Server responded with error status
        const { status, data } = error.response;

        if (status === 401) {
          // Unauthorized - clear token and redirect. Routine token-expiry flow, not a bug.
          localStorage.removeItem("token");
          throw makeApiError("Unauthorized - please log in again", error, status);
        } else if (status === 403) {
          throw makeApiError(data?.message || "You are not authorized to perform this action", error, status);
        } else if (status === 404) {
          throw makeApiError(data?.message || "Resource not found", error, status);
        } else if (status === 400 && data?.errors && Array.isArray(data.errors)) {
          // Validation errors
          const errorMessages = data.errors.map((err: { path: string; message: string }) => err.message).join(", ");
          throw makeApiError(errorMessages || data.message || "Validation failed", error, status);
        } else {
          throw makeApiError(data?.message || `Request failed: ${error.response.statusText}`, error, status);
        }
      } else if (error.request) {
        // Request was made but no response received
        throw makeApiError("Network error - please check your connection", error);
      } else {
        // Something else happened
        throw makeApiError(error.message || "An unexpected error occurred", error);
      }
    }
  );

  return instance;
};

// Export configured axios instance
export const apiClient = createAxiosInstance();
