import { auth } from "@/lib/auth"
import { buildProfileStatistics } from "@/lib/statistics"
import {
  getCurrentUserStatistics,
  getHistoricalUserStatistics,
  getHistoricalUserMoneyStatistics,
  mergeHistoricalAndCurrentStatistics,
} from "@/services/statistics.service"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [current, storedHistory, money] = await Promise.all([
    getCurrentUserStatistics(session.user.id),
    getHistoricalUserStatistics(session.user.id),
    getHistoricalUserMoneyStatistics(session.user.id),
  ])
  const lifetime = mergeHistoricalAndCurrentStatistics(storedHistory, current)
  return NextResponse.json({
    statistics: buildProfileStatistics(lifetime, money),
  })
}
