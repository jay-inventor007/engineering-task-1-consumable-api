import type { ErrorRequestHandler, RequestHandler } from 'express';

export type FieldError = { field: string; message: string };

// The single error shape the API ever returns:
// { "error": { "code": "NOT_FOUND", "message": "Listing not found", "details": [...] } }
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
  }
}

export const notFound = (resource: string) => new ApiError(404, 'NOT_FOUND', `${resource} not found`);

export const unknownRoute: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', `No endpoint for ${req.method} ${req.path}`));
};

type PgError = { code?: string; constraint?: string };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err?.type === 'entity.parse.failed') {
    apiError = new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  } else if (err?.type === 'entity.too.large') {
    apiError = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else if ((err as PgError)?.code === '23505') {
    apiError = new ApiError(409, 'CONFLICT', 'This would create a duplicate record');
  } else {
    console.error(err);
    apiError = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on our side');
  }

  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  });
};
