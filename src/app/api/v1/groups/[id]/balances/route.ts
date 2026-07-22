import { auth } from "@/lib/auth"
import * as balancesService from "@/services/balances.service"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  try {
    const balances = await balancesService.getGroupBalances(groupId, session.user.id)
    return NextResponse.json({ balances })
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
}
