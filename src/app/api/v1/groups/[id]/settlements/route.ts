import { auth } from "@/lib/auth"
import * as settlementsService from "@/services/settlements.service"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  try {
    const settlements = await settlementsService.getGroupSettlements(groupId, session.user.id)
    return NextResponse.json({ settlements })
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
}
