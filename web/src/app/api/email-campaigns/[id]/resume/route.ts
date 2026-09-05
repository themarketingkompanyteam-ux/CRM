import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns } from "@/db/schema";
import { instantlyProvider } from "@/lib/email/instantly";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id)).limit(1);
  if (!campaign?.instantlyCampaignId) return NextResponse.json({ error: "Campaign not launched" }, { status: 400 });

  await instantlyProvider.resumeCampaign(campaign.instantlyCampaignId);
  const [updated] = await db
    .update(emailCampaigns)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(emailCampaigns.id, id))
    .returning();
  return NextResponse.json(updated);
}
