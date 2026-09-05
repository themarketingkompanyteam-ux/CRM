import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaignSteps } from "@/db/schema";
import { instantlyProvider } from "@/lib/email/instantly";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = Number((await params).id);
  const body = await request.json();
  const to: string = body.to;
  const stepIndex: number = body.stepIndex ?? 0;

  if (!to) return NextResponse.json({ error: "A test recipient address is required" }, { status: 400 });

  const steps = await db
    .select()
    .from(emailCampaignSteps)
    .where(eq(emailCampaignSteps.campaignId, campaignId))
    .orderBy(emailCampaignSteps.stepOrder);
  const step = steps[stepIndex];
  if (!step) return NextResponse.json({ error: "That sequence step does not exist" }, { status: 400 });

  const rendered = renderPreview(step.body, body.sampleContact);
  const renderedSubject = renderPreview(step.subject, body.sampleContact);

  const result = await instantlyProvider.sendTestEmail(to, renderedSubject, rendered);
  return NextResponse.json(result);
}

function renderPreview(template: string, sample?: Record<string, string>) {
  const defaults: Record<string, string> = {
    firstName: "Jordan",
    lastName: "Smith",
    companyName: "Acme Co",
    jobTitle: "Owner",
    website: "acme.example.com",
    ...sample,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => defaults[key] ?? `{{${key}}}`);
}
