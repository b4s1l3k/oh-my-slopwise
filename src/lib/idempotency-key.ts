export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/

export function readIdempotencyKey(request: Request): string | undefined {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim()
  if (!key) return undefined
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw new Error("INVALID_IDEMPOTENCY_KEY")
  return key
}
