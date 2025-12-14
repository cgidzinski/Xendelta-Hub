/**
 * API Client Utilities
 * Centralized functions for making authenticated API requests
 */

export interface ApiResponse<T = any> {
  status: boolean;
  message: string;
  data?: T;
  errors?: Array<{ path: string; message: string }>;
}

/**
 * Get authentication headers with token from localStorage
 */
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Check if response is an unauthorized error (401)
 */
export function isUnauthorizedError(response: Response): boolean {
  return response.status === 401;
}

/**
 * Check if response is a forbidden error (403)
 */
export function isForbiddenError(response: Response): boolean {
  return response.status === 403;
}

/**
 * Check if response is a not found error (404)
 */
export function isNotFoundError(response: Response): boolean {
  return response.status === 404;
}

/**
 * Handle API error responses and throw appropriate errors
 */
export async function handleApiError(response: Response): Promise<never> {
  if (isUnauthorizedError(response)) {
    throw new Error("Unauthorized - please log in again");
  } else if (isForbiddenError(response)) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "You are not authorized to perform this action");
  } else if (isNotFoundError(response)) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Resource not found");
  } else {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Request failed: ${response.statusText}`);
  }
}

/**
 * Generic API request wrapper with authentication
 */
export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = getAuthHeaders();
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  const data: ApiResponse<T> = await response.json();
  
  if (!data.status) {
    throw new Error(data.message || "Request failed");
  }

  return data.data as T;
}

/**
 * Typed GET request
 */
export async function get<T = any>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: "GET" });
}

/**
 * Typed POST request
 */
export async function post<T = any>(url: string, body?: any): Promise<T> {
  return apiRequest<T>(url, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Typed PUT request
 */
export async function put<T = any>(url: string, body?: any): Promise<T> {
  return apiRequest<T>(url, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Typed DELETE request
 */
export async function del<T = any>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: "DELETE" });
}

