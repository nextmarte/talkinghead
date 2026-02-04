-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "user_agent_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "user_agent_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_agent_access_userId_idx" ON "user_agent_access"("userId");

-- CreateIndex
CREATE INDEX "user_agent_access_agentId_idx" ON "user_agent_access"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_agent_access_userId_agentId_key" ON "user_agent_access"("userId", "agentId");

-- AddForeignKey
ALTER TABLE "user_agent_access" ADD CONSTRAINT "user_agent_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agent_access" ADD CONSTRAINT "user_agent_access_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
