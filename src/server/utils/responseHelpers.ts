/**
 * API Response Helper Functions
 * Standardized response formatting for Express routes
 */

import { Response } from "express";

export interface ApiResponse<T = any> {
  status: boolean;
  message: string;
  data?: T;
  errors?: Array<{ path: string; message: string }>;
}

/**
 * Send a successful response
 */
export function successResponse<T = any>(
  res: Response,
  data?: T,
  message: string = ""
): Response {
  return res.json({
    status: true,
    message,
    data,
  });
}

/**
 * Send an error response
 */
export function errorResponse(
  res: Response,
  status: number,
  message: string,
  errors?: Array<{ path: string; message: string }>
): Response {
  return res.status(status).json({
    status: false,
    message,
    errors,
  });
}

/**
 * Send a 404 Not Found response
 */
export function notFoundResponse(
  res: Response,
  resource: string = "Resource"
): Response {
  return errorResponse(res, 404, `${resource} not found`);
}

/**
 * Send a 401 Unauthorized response
 */
export function unauthorizedResponse(
  res: Response,
  message: string = "Unauthorized"
): Response {
  return errorResponse(res, 401, message);
}

/**
 * Send a 403 Forbidden response
 */
export function forbiddenResponse(
  res: Response,
  message: string = "You are not authorized to perform this action"
): Response {
  return errorResponse(res, 403, message);
}

/**
 * Send a 400 Bad Request response
 */
export function badRequestResponse(
  res: Response,
  message: string = "Bad request",
  errors?: Array<{ path: string; message: string }>
): Response {
  return errorResponse(res, 400, message, errors);
}

