export interface AppError {
  message: string
  code?: string
  cause?: unknown
}

export const toAppError = (error: unknown, fallback = 'Something went wrong.'): AppError => {
  if (error instanceof Error) return { message: error.message, cause: error }
  if (typeof error === 'string') return { message: error }
  return { message: fallback, cause: error }
}

export const getErrorMessage = (error: unknown, fallback?: string) =>
  toAppError(error, fallback).message