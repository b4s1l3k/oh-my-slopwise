import { NextResponse } from "next/server"
import type { AuthenticateCredentialsResponseDto } from "@contract/v1"
import { credentialsAuthenticationSchema } from "@/lib/validations/auth"
import { authenticateCredentials } from "@/services/authentication.service"

const INVALID_CREDENTIALS = { error: "Unauthorized" }

export async function POST(req: Request) {
  const parsed = credentialsAuthenticationSchema.safeParse(
    await req.json().catch(() => null)
  )
  if (!parsed.success) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 })
  }

  try {
    const user = await authenticateCredentials(parsed.data.email, parsed.data.password)
    if (!user) {
      return NextResponse.json(INVALID_CREDENTIALS, { status: 401 })
    }
    return NextResponse.json({ user } satisfies AuthenticateCredentialsResponseDto)
  } catch {
    return NextResponse.json(
      { error: { message: "Internal server error" } },
      { status: 500 }
    )
  }
}
