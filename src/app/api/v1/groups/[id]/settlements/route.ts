import { auth } from "@/lib/auth"
import * as settlementsService from "@/services/settlements.service"
import { handleServiceError } from "@/lib/api-errors"
import { NextResponse } from "next/server"
import {
  toResetSettlementsResponse,
  toSettlementListResponse,
} from "@/lib/api/v1/response-mappers"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  try {
    const settlements = await settlementsService.getGroupSettlements(groupId, session.user.id)
    return NextResponse.json(toSettlementListResponse(settlements))
  } catch (e) {
    return handleServiceError(e)
  }
}

// Сброс всех расчётов группы (только админ) — долги пересчитываются с нуля
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  try {
    const result = await settlementsService.resetSettlements(groupId, session.user.id)
    return NextResponse.json(toResetSettlementsResponse(result))
  } catch (e) {
    return handleServiceError(e)
  }
}
