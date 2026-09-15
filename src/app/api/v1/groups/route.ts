import { auth } from "@/lib/auth"
import { createGroupSchema } from "@/lib/validations/group"
import * as groupsService from "@/services/groups.service"
import { handleServiceError } from "@/lib/api-errors"
import { NextResponse } from "next/server"
import {
  toGroupListResponse,
  toGroupResponse,
} from "@/lib/api/v1/response-mappers"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cursor = new URL(req.url).searchParams.get("cursor")
  try {
    const result = await groupsService.getUserGroups(session.user.id, cursor)
    return NextResponse.json(toGroupListResponse(result))
  } catch (e) {
    return handleServiceError(e)
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = createGroupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const group = await groupsService.createGroup(session.user.id, parsed.data)
    return NextResponse.json(toGroupResponse(group), { status: 201 })
  } catch (e) {
    return handleServiceError(e)
  }
}
