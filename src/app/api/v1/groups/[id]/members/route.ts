import { auth } from "@/lib/auth"
import * as groupsService from "@/services/groups.service"
import { NextResponse } from "next/server"
import { z } from "zod"

type Params = { params: Promise<{ id: string }> }

const addSchema = z.object({ userId: z.string().min(1) })

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  const body = await req.json()
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const member = await groupsService.addMember(groupId, session.user.id, parsed.data.userId)
    return NextResponse.json({ member }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  const url = new URL(req.url)
  const userId = url.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  try {
    await groupsService.removeMember(groupId, session.user.id, userId)
    return NextResponse.json({})
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
}
