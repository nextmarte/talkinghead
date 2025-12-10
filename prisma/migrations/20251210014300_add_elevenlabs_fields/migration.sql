-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "elevenLabsVoiceId" TEXT,
ADD COLUMN     "useElevenLabs" BOOLEAN NOT NULL DEFAULT false;
