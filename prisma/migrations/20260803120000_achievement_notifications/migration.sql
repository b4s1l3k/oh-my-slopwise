-- Add notification timestamp for achievement unlock toasts.
ALTER TABLE "user_achievements" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- Treat all already-earned achievements as already notified, so deploying this
-- feature does not spam users with toasts for awards they unlocked long ago.
UPDATE "user_achievements" SET "notifiedAt" = "unlockedAt";

-- Index used by the "unseen unlocks" lookup.
CREATE INDEX "user_achievements_userId_notifiedAt_idx" ON "user_achievements"("userId", "notifiedAt");
