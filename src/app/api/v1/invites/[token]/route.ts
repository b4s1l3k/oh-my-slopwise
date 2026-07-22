import { auth } from "@/lib/auth"
import * as invites from "@/services/invites.service"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ token: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { token } = await params
  const info = await invites.getInviteInfo(token, session.user.id)
  if (!info) return NextResponse.json({ error: "Приглашение недействительно" }, { status: 404 })
  return NextResponse.json({ invite: info })
}
