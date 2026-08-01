import { evaluateAchievements } from "@/lib/achievements"
import { prisma } from "@/lib/db"
import {
  getCurrentUserStatistics,
  getHistoricalUserStatistics,
  mergeHistoricalAndCurrentStatistics,
} from "@/services/statistics.service"

/**
 * Calculates current progress, persists newly unlocked achievements, and then
 * combines both sources. An earned achievement is permanent even if a source
 * group or expense is later deleted.
 */
export async function getUserAchievements(userId: string, now = new Date()) {
  const [currentMetrics, historicalMetrics, persisted] = await Promise.all([
    getCurrentUserStatistics(userId, now),
    getHistoricalUserStatistics(userId, now),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    }),
  ])

  const metrics = mergeHistoricalAndCurrentStatistics(historicalMetrics, currentMetrics)
  const persistedIds = new Set(persisted.map((item) => item.achievementId))
  const current = evaluateAchievements(metrics, persistedIds)
  const newlyUnlocked = current.filter(
    (achievement) => achievement.unlocked && !persistedIds.has(achievement.id)
  )

  if (newlyUnlocked.length > 0) {
    await prisma.userAchievement.createMany({
      data: newlyUnlocked.map((achievement) => ({
        userId,
        achievementId: achievement.id,
        unlockedAt: now,
      })),
      skipDuplicates: true,
    })
  }

  return {
    summary: {
      unlocked: current.filter((achievement) => achievement.unlocked).length,
      total: current.length,
    },
    achievements: current,
  }
}
