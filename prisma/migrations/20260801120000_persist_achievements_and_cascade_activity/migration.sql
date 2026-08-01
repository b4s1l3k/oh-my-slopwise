-- Persist unlocked achievements independently from the source groups and expenses.
CREATE TABLE "user_achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_achievements_userId_achievementId_key"
    ON "user_achievements"("userId", "achievementId");

CREATE INDEX "user_achievements_achievementId_idx"
    ON "user_achievements"("achievementId");

ALTER TABLE "user_achievements"
    ADD CONSTRAINT "user_achievements_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Activity belongs to a group and must not survive deletion as an orphan.
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_groupId_fkey";
ALTER TABLE "activity_log"
    ADD CONSTRAINT "activity_log_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A cash-on-the-spot settlement is part of its expense. If the expense is
-- removed, keeping that settlement would corrupt the remaining group balance.
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_expenseId_fkey";
ALTER TABLE "settlements"
    ADD CONSTRAINT "settlements_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "expenses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Statistics are calculated from source rows. These indexes keep the profile
-- queries efficient without introducing denormalized counters that can drift.
CREATE INDEX "groups_createdById_idx" ON "groups"("createdById");
CREATE INDEX "expenses_createdById_idx" ON "expenses"("createdById");
CREATE INDEX "expense_splits_userId_idx" ON "expense_splits"("userId");
CREATE INDEX "settlements_toUserId_idx" ON "settlements"("toUserId");
CREATE INDEX "group_invites_createdById_idx" ON "group_invites"("createdById");
