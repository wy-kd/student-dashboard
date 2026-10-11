-- Additive V2.3 planning tables. No existing tables or rows are altered.

-- CreateTable
CREATE TABLE "SchedulingPreference" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "preferredMinutes" INTEGER NOT NULL DEFAULT 50,
    "minimumMinutes" INTEGER NOT NULL DEFAULT 20,
    "restMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxDailyMinutes" INTEGER,
    CONSTRAINT "SchedulingPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "AvailabilityWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "windows" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "AvailabilityException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startAt" REAL NOT NULL,
    "endAt" REAL NOT NULL,
    "fixed" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Commitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkEstimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "minutes" REAL NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WorkEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" REAL NOT NULL,
    CONSTRAINT "ScheduleBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlannedWorkBlock" (
    "workKey" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taskId" TEXT,
    "assignmentId" TEXT,
    "examId" TEXT,
    "startAt" REAL NOT NULL,
    "endAt" REAL NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'planned',
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "batchId" TEXT,
    "sessionId" TEXT,
    "timerId" TEXT,
    CONSTRAINT "PlannedWorkBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlannedWorkBlock_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedWorkBlock_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedWorkBlock_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedWorkBlock_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScheduleBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedWorkBlock_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedWorkBlock_timerId_fkey" FOREIGN KEY ("timerId") REFERENCES "StudyTimer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityException_userId_date_key" ON "AvailabilityException"("userId", "date");

-- CreateIndex
CREATE INDEX "Commitment_userId_startAt_idx" ON "Commitment"("userId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkEstimate_userId_workKey_key" ON "WorkEstimate"("userId", "workKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedWorkBlock_sessionId_key" ON "PlannedWorkBlock"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedWorkBlock_timerId_key" ON "PlannedWorkBlock"("timerId");

-- CreateIndex
CREATE INDEX "PlannedWorkBlock_userId_startAt_idx" ON "PlannedWorkBlock"("userId", "startAt");
