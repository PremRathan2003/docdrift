-- The documentation pull request opened from one analysis run. Unique on the
-- run, so re-running "open the docs PR" updates this row rather than opening a
-- second pull request.
CREATE TABLE "DocsPullRequest" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "baseRef" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "htmlUrl" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "documents" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocsPullRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocsPullRequest_analysisRunId_key" ON "DocsPullRequest"("analysisRunId");

ALTER TABLE "DocsPullRequest" ADD CONSTRAINT "DocsPullRequest_analysisRunId_fkey"
    FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocsPullRequest" ADD CONSTRAINT "DocsPullRequest_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
