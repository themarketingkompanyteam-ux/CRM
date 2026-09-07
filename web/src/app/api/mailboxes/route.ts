import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";

const SAFE_COLUMNS = {
  id: mailboxes.id,
  email: mailboxes.email,
  domain: mailboxes.domain,
  provider: mailboxes.provider,
  connectionStatus: mailboxes.connectionStatus,
  lastConnectionError: mailboxes.lastConnectionError,
  warmupStatus: mailboxes.warmupStatus,
  warmupStartedAt: mailboxes.warmupStartedAt,
  warmupDay: mailboxes.warmupDay,
  warmupDailyLimit: mailboxes.warmupDailyLimit,
  campaignDailyLimit: mailboxes.campaignDailyLimit,
  sentToday: mailboxes.sentToday,
  bouncedToday: mailboxes.bouncedToday,
  repliedToday: mailboxes.repliedToday,
  unsubscribesToday: mailboxes.unsubscribesToday,
  healthScore: mailboxes.healthScore,
  healthStatus: mailboxes.healthStatus,
  healthReasons: mailboxes.healthReasons,
  campaignEnabled: mailboxes.campaignEnabled,
  createdAt: mailboxes.createdAt,
};

export async function GET() {
  // Never select oauthRefreshTokenEnc / smtpPasswordEnc — this response is safe to render directly.
  const rows = await db.select(SAFE_COLUMNS).from(mailboxes).orderBy(desc(mailboxes.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email: string = body.email;
  if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const domain = email.split("@")[1];
  const [created] = await db
    .insert(mailboxes)
    .values({
      email,
      domain,
      provider: body.provider === "smtp" ? "smtp" : "gmail",
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      campaignDailyLimit: body.campaignDailyLimit ?? 30,
    })
    .returning(SAFE_COLUMNS);

  return NextResponse.json(created);
}
