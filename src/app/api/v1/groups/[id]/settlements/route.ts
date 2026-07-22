import { auth } from "@/lib/auth"
import * as settlementsService from "@/services/settlements.service"
import { handleServiceError } from "@/lib/api-errors"
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

// Сброс всех расчётов группы (только админ) — долги пересчитываются с нуля
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  try {
    const result = await settlementsService.resetSettlements(groupId, session.user.id)
    return NextResponse.json(result)
  } catch (e) {
    return handleServiceError(e)
  }
}
