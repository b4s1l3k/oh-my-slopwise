import { auth } from "@/lib/auth"
import { buildProfileStatistics } from "@/lib/statistics"
import { getHistoricalUserStatisticsSnapshot } from "@/services/statistics.service"
import { NextResponse } from "next/server"
import { toProfileStatisticsResponse } from "@/lib/api/v1/response-mappers"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Показываем статистику за всё время: берём накопленные факты аккаунта.
  // Их достаточно (миграция бэкфилит существующие данные, новые пишутся сразу
  // в транзакции), поэтому отдельный расчёт «текущих» показателей и слияние
  // с ними не нужны — результат тот же.
  const { metrics, money } = await getHistoricalUserStatisticsSnapshot(session.user.id)
  return NextResponse.json(
    toProfileStatisticsResponse(buildProfileStatistics(metrics, money))
  )
}
