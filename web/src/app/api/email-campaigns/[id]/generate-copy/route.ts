import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns, emailCampaignLeads, aiResearch, aiOpportunities, aiSalesBriefs } from "@/db/schema";
import { geminiProvider } from "@/lib/ai/gemini";
import { buildEmailSequencePrompt, EMAIL_SEQUENCE_SCHEMA, PROMPT_VERSIONS } from "@/lib/ai/prompts";
import { logAiUsage } from "@/lib/ai/usage";

type SequenceResult = {
  subjectLines: string[];
  initialEmail: string;
  followUp1: string;
  followUp2: string;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = Number((await params).id);
  const body = await request.json();
  const audienceDescription: string = body.audienceDescription || "Business leads matching this campaign's audience filter";

  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).limit(1);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Use one already-analyzed lead in this campaign (if any) as a representative Growth Intelligence example.
  let research: unknown;
  let opportunities: unknown;
  let salesBrief: unknown;
  const [sampleLead] = await db
    .select({ contactId: emailCampaignLeads.contactId })
    .from(emailCampaignLeads)
    .where(eq(emailCampaignLeads.campaignId, campaignId))
    .limit(1);

  if (sampleLead && campaign.personalizationMode !== "standard") {
    const [r] = await db.select().from(aiResearch).where(eq(aiResearch.contactId, sampleLead.contactId)).limit(1);
    const opps = await db.select().from(aiOpportunities).where(eq(aiOpportunities.contactId, sampleLead.contactId));
    const [brief] = await db.select().from(aiSalesBriefs).where(eq(aiSalesBriefs.contactId, sampleLead.contactId)).limit(1);
    research = r ?? undefined;
    opportunities = opps.length > 0 ? opps : undefined;
    salesBrief = brief ?? undefined;
  }

  const { system, user } = buildEmailSequencePrompt({ audienceDescription, research, opportunities, salesBrief });
  const startedAt = Date.now();
  const result = await geminiProvider.generateStructured<SequenceResult>({
    systemPrompt: system,
    userPrompt: user,
    schema: EMAIL_SEQUENCE_SCHEMA,
  });

  await logAiUsage({
    contactId: null,
    operation: "email_sequence",
    model: geminiProvider.model,
    promptVersion: PROMPT_VERSIONS.emailSequence,
    status: result.ok ? "SUCCESS" : "FAILED",
    usage: result.usage,
    durationMs: Date.now() - startedAt,
    errorMessage: result.errorMessage,
  });

  if (!result.ok || !result.data) {
    return NextResponse.json({ error: result.errorMessage || "AI generation failed" }, { status: 502 });
  }

  return NextResponse.json({
    subjectLines: result.data.subjectLines,
    steps: [
      { subject: result.data.subjectLines[0] ?? "Quick question", body: result.data.initialEmail, delayDays: 0 },
      { subject: `Re: ${result.data.subjectLines[0] ?? "Quick question"}`, body: result.data.followUp1, delayDays: 3 },
      { subject: `Re: ${result.data.subjectLines[0] ?? "Quick question"}`, body: result.data.followUp2, delayDays: 5 },
    ],
    usedGrowthIntelligenceExample: !!research,
  });
}
