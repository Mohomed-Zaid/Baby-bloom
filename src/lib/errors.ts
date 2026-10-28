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

export const getErrorMessage = (error: unknown, fallback?: string): string => {
  const raw = toAppError(error, fallback).message
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0]?.message || parsed[0]?.path)) {
        return parsed
          .map((p) => {
            const field = Array.isArray(p.path) && p.path.length > 0 ? p.path.join('.') : ''
            const msg = p.message || 'Validation error'
            return field ? `${field}: ${msg}` : msg
          })
          .join('; ')
      }
    } catch {}
  }
  return raw
}