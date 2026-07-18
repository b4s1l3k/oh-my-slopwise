import { auth } from "@/lib/auth"
import { createSettlementSchema } from "@/lib/validations/settlement"
import * as settlementsService from "@/services/settlements.service"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const parsed = createSettlementSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const settlement = await settlementsService.createSettlement(session.user.id, parsed.data)
    return NextResponse.json({ settlement }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    return NextResponse.json({ error: "Error" }, { status: 500 })
  }
}
