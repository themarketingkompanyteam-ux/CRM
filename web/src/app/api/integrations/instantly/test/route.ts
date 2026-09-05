import { NextResponse } from "next/server";
import { instantlyProvider } from "@/lib/email/instantly";
import { saveInstantlyState } from "@/lib/email/settings";

export async function POST() {
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ ok: false, message: "INSTANTLY_API_KEY is not set in the environment." });
  }
  const result = await instantlyProvider.testConnection();
  await saveInstantlyState({ connected: result.ok, lastTestedAt: new Date().toISOString() });
  return NextResponse.json(result);
}
