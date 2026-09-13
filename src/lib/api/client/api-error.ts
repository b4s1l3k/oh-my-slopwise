export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly details: unknown,
    readonly requestId: string,
    readonly userMessage: string | undefined,
    options?: ErrorOptions
  ) {
    super(userMessage ?? `API request failed with status ${status}`, options)
    this.name = "ApiError"
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.userMessage ?? fallback
  return fallback
}
