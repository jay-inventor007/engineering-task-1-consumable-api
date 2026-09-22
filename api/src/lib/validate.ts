import { z } from 'zod';
import { ApiError, type FieldError } from './errors.js';

// Say "is required" for a missing field instead of Zod's default "expected string, received undefined".
z.config({
  customError: (issue) => (issue.code === 'invalid_type' && issue.input === undefined ? 'is required' : undefined),
});

function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.flatMap((issue) => {
    // An unrecognised key is reported against the object, so name each offending key instead.
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ field: key, message: 'is not a recognised field' }));
    }
    return [{ field: issue.path.join('.') || '(root)', message: issue.message }];
  });
}

// Query strings and path params are the client addressing something badly: 400.
export function parseQuery<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'INVALID_QUERY', 'One or more query parameters are invalid', toFieldErrors(result.error));
  }
  return result.data;
}

// A well-formed request body with invalid content: 422, naming each field.
export function parseBody<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'The request body failed validation', toFieldErrors(result.error));
  }
  return result.data;
}

// A malformed identifier cannot match any record, so it is reported as 404, never as a 500 from
// Postgres failing to cast it to uuid.
export function parseId(raw: string | undefined, resource: string): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  return result.data;
}
