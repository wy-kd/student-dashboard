-- Additive only: retain every V2.3 capture and existing table/record.
ALTER TABLE "InboxItem" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InboxItem" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "InboxItem" ADD COLUMN "snoozedUntil" REAL;
ALTER TABLE "InboxItem" ADD COLUMN "processedType" TEXT;
ALTER TABLE "InboxItem" ADD COLUMN "processedId" TEXT;
ALTER TABLE "InboxItem" ADD COLUMN "processedRequestId" TEXT;
CREATE TABLE "InboxReviewPreference" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "frequency" TEXT NOT NULL DEFAULT 'off',
  "time" TEXT NOT NULL DEFAULT '18:00',
  "weekday" INTEGER NOT NULL DEFAULT 1,
  "lastState" TEXT,
  "lastPeriod" TEXT,
  CONSTRAINT "InboxReviewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
