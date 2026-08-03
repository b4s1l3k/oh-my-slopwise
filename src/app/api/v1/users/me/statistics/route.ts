import { auth } from "@/lib/auth"
import { buildProfileStatistics } from "@/lib/statistics"
import {
  getHistoricalUserStatistics,
  getHistoricalUserMoneyStatistics,
} from "@/services/statistics.service"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Показываем статистику за всё время: берём накопленные факты аккаунта.
  // Их достаточно (миграция бэкфилит существующие данные, новые пишутся сразу
  // в транзакции), поэтому отдельный расчёт «текущих» показателей и слияние
  // с ними не нужны — результат тот же.
  const [lifetime, money] = await Promise.all([
    getHistoricalUserStatistics(session.user.id),
    getHistoricalUserMoneyStatistics(session.user.id),
  ])
  return NextResponse.json({
    statistics: buildProfileStatistics(lifetime, money),
  })
}
