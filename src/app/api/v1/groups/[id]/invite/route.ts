import { auth } from "@/lib/auth"
import * as invites from "@/services/invites.service"
import { handleServiceError } from "@/lib/api-errors"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  try {
    const invite = await invites.getOrCreateInvite(groupId, session.user.id)
    return NextResponse.json({ token: invite.token })
  } catch (e) {
    return handleServiceError(e)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  try {
    await invites.revokeInvite(groupId, session.user.id)
    return NextResponse.json({})
  } catch (e) {
    return handleServiceError(e)
  }
}
