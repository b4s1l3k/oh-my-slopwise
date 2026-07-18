import { auth } from "@/lib/auth"
import * as balancesService from "@/services/balances.service"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const overview = await balancesService.getOverviewBalances(session.user.id)
  return NextResponse.json(overview)
}
