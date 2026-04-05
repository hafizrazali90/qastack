import type { ServerResponse } from 'node:http';

/**
 * Write a JSON response with CORS headers.
 */
export function jsonResponse(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

/**
 * Write a successful JSON response.
 */
export function jsonSuccess(res: ServerResponse, data: unknown): void {
  jsonResponse(res, 200, { success: true, data });
}

/**
 * Write an error JSON response.
 */
export function jsonError(
  res: ServerResponse,
  statusCode: number,
  message: string,
): void {
  jsonResponse(res, statusCode, { success: false, error: message });
}
