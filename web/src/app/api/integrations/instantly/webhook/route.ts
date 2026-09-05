import { NextRequest, NextResponse } from "next/server";
import { registerInstantlyWebhook, listInstantlyWebhooks } from "@/lib/email/instantly";

export async function GET() {
  const webhooks = await listInstantlyWebhooks();
  return NextResponse.json(webhooks.map((w) => ({ id: w.id, targetUrl: w.target_hook_url, name: w.name })));
}

export async function POST(request: NextRequest) {
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "INSTANTLY_WEBHOOK_SECRET is not set in the environment" }, { status: 400 });
  }
  const body = await request.json();
  const publicUrl: string = body.publicUrl;
  if (!publicUrl) {
    return NextResponse.json(
      { error: "Provide the publicly reachable base URL for this CRM (e.g. https://your-domain.com) as publicUrl" },
      { status: 400 }
    );
  }
  const targetUrl = `${publicUrl.replace(/\/$/, "")}/api/webhooks/instantly`;
  const result = await registerInstantlyWebhook(targetUrl, secret);
  return NextResponse.json({ ok: true, webhookId: result.id, targetUrl });
}
