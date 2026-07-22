import { auth } from "@/lib/auth"
import * as invites from "@/services/invites.service"
import { handleServiceError } from "@/lib/api-errors"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ token: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { token } = await params
  try {
    const result = await invites.acceptInvite(token, session.user.id)
    return NextResponse.json(result)
  } catch (e) {
    return handleServiceError(e)
  }
}
