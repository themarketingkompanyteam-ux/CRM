import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentProviders } from "@/db/schema";
import { getAdapter } from "@/lib/enrichment/registry";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const adapter = getAdapter(key);
  if (!adapter) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  if (!adapter.configured) {
    return NextResponse.json({ ok: false, message: "No API key configured for this provider" }, { status: 200 });
  }

  const result = await adapter.testConnection();
  const credits = await adapter.getCredits();

  await db
    .update(enrichmentProviders)
    .set({
      status: result.ok ? "CONNECTED" : result.message.toLowerCase().includes("invalid") ? "AUTH_ERROR" : "UNKNOWN",
      lastTestedAt: new Date(),
      lastErrorAt: result.ok ? undefined : new Date(),
      lastErrorMessage: result.ok ? undefined : result.message,
      creditsRemaining: credits.remaining,
      creditsCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(enrichmentProviders.key, key));

  return NextResponse.json({ ok: result.ok, message: result.message, creditsRemaining: credits.remaining });
}
