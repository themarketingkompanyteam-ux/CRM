import { NextResponse } from "next/server";
import { getInstantlyState } from "@/lib/email/settings";

export async function GET() {
  const state = await getInstantlyState();
  return NextResponse.json({
    ...state,
    apiKeyConfigured: !!process.env.INSTANTLY_API_KEY,
    apiVersion: "v2",
  });
}
