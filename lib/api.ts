import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? undefined } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.flatten() } },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  console.error(error);
  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development' ? message : 'Unexpected server error.',
      },
    },
    { status: 500 },
  );
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

export function parseLimit(value: string | null, fallback = 25, max = 100) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new ApiError(400, 'INVALID_LIMIT', 'limit must be a positive integer.');
  return Math.min(parsed, max);
}

export function parseOffset(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new ApiError(400, 'INVALID_OFFSET', 'offset must be a non-negative integer.');
  return parsed;
}
