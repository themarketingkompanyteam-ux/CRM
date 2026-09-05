import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, contacts } from "@/db/schema";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contactId = Number(body.contactId);

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact || !contact.phone) {
    return NextResponse.json({ error: "Contact has no phone number" }, { status: 400 });
  }

  const [twilioSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "twilio"))
    .limit(1);

  if (!twilioSettings?.value) {
    return NextResponse.json({
      mode: "simulated",
      message: "Twilio isn't connected yet — this is a simulated call. Connect it in Settings to dial for real.",
      phone: contact.phone,
    });
  }

  const v = twilioSettings.value as {
    accountSid: string;
    apiKeySid: string;
    apiKeySecret: string;
    fromPhone: string;
  };

  try {
    const { default: Twilio } = await import("twilio");
    const client = Twilio(v.apiKeySid, v.apiKeySecret, { accountSid: v.accountSid });
    const call = await client.calls.create({
      to: contact.phone,
      from: v.fromPhone,
      url: "http://demo.twilio.com/docs/voice.xml",
    });
    return NextResponse.json({ mode: "live", callSid: call.sid, phone: contact.phone });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to place call" },
      { status: 500 }
    );
  }
}
