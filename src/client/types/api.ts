/**
 * Shared API Types
 * Centralized type definitions for API responses
 */

export interface ApiResponse<T = any> {
  status: boolean;
  message: string;
  data?: T;
  errors?: Array<{ path: string; message: string }>;
}

