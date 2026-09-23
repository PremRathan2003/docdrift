-- Cache of documentation file contents, keyed by git blob SHA (content hash).
CREATE TABLE "DocumentBlob" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "blobSha" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentBlob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentBlob_repositoryId_blobSha_key" ON "DocumentBlob"("repositoryId", "blobSha");
CREATE INDEX "DocumentBlob_repositoryId_lastUsedAt_idx" ON "DocumentBlob"("repositoryId", "lastUsedAt");

ALTER TABLE "DocumentBlob" ADD CONSTRAINT "DocumentBlob_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
