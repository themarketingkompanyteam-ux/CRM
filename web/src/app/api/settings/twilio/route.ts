import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

function mask(value: string) {
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "*".repeat(Math.max(0, value.length - 6)) + value.slice(-4);
}

export async function GET() {
  const [twilio] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "twilio"))
    .limit(1);

  if (!twilio?.value) {
    return NextResponse.json({ connected: false });
  }

  const v = twilio.value as Record<string, string>;
  return NextResponse.json({
    connected: true,
    accountSid: v.accountSid ? mask(v.accountSid) : "",
    apiKeySid: v.apiKeySid ? mask(v.apiKeySid) : "",
    fromPhone: v.fromPhone ?? "",
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { accountSid, apiKeySid, apiKeySecret, fromPhone } = body;

  if (!accountSid || !apiKeySid || !apiKeySecret || !fromPhone) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  await db
    .insert(settings)
    .values({
      key: "twilio",
      value: { accountSid, apiKeySid, apiKeySecret, fromPhone },
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { accountSid, apiKeySid, apiKeySecret, fromPhone }, updatedAt: new Date() },
    });

  return NextResponse.json({ status: "saved" });
}

export async function DELETE() {
  await db.delete(settings).where(eq(settings.key, "twilio"));
  return NextResponse.json({ status: "disconnected" });
}
