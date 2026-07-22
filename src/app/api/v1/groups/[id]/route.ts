import { auth } from "@/lib/auth"
import { updateGroupSchema } from "@/lib/validations/group"
import * as groupsService from "@/services/groups.service"
import { handleServiceError } from "@/lib/api-errors"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const group = await groupsService.getGroup(id, session.user.id)
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ group })
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = updateGroupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const group = await groupsService.updateGroup(id, session.user.id, parsed.data)
    return NextResponse.json({ group })
  } catch (e) {
    return handleServiceError(e)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  try {
    await groupsService.deleteGroup(id, session.user.id)
    return NextResponse.json({})
  } catch (e) {
    return handleServiceError(e)
  }
}
