-- AlterTable: PublishJob - add missing optional columns for Documentary, UGC, and Podcast relations
ALTER TABLE "PublishJob" ADD COLUMN     "documentaryId" TEXT,
ADD COLUMN     "podcastEpisodeId" TEXT,
ADD COLUMN     "ugcJobId" TEXT,
ALTER COLUMN "shortVideoId" DROP NOT NULL;

-- AlterTable: UGCJob - add optional campaignId
ALTER TABLE "UGCJob" ADD COLUMN     "campaignId" TEXT;

-- AlterTable: UGCProduct - add optional campaignId
ALTER TABLE "UGCProduct" ADD COLUMN     "campaignId" TEXT;

-- CreateTable: UGCCampaign
CREATE TABLE "UGCCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UGCCampaign_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: PublishJob -> Documentary
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_documentaryId_fkey" FOREIGN KEY ("documentaryId") REFERENCES "Documentary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PublishJob -> UGCJob
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_ugcJobId_fkey" FOREIGN KEY ("ugcJobId") REFERENCES "UGCJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PublishJob -> PodcastEpisode
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_podcastEpisodeId_fkey" FOREIGN KEY ("podcastEpisodeId") REFERENCES "PodcastEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: UGCProduct -> UGCCampaign
ALTER TABLE "UGCProduct" ADD CONSTRAINT "UGCProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "UGCCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: UGCJob -> UGCCampaign
ALTER TABLE "UGCJob" ADD CONSTRAINT "UGCJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "UGCCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: UGCCampaign -> User
ALTER TABLE "UGCCampaign" ADD CONSTRAINT "UGCCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
