import { auth } from "@/lib/auth"
import { createGroupSchema } from "@/lib/validations/group"
import * as groupsService from "@/services/groups.service"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const groups = await groupsService.getUserGroups(session.user.id)
  return NextResponse.json({ groups })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const parsed = createGroupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const group = await groupsService.createGroup(session.user.id, parsed.data)
  return NextResponse.json({ group }, { status: 201 })
}
