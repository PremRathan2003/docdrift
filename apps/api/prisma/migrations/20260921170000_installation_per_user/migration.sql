-- DropIndex
DROP INDEX "GithubInstallation_installationId_key";

-- DropIndex
DROP INDEX "GithubInstallation_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "GithubInstallation_userId_installationId_key" ON "GithubInstallation"("userId", "installationId");
