import { NextRequest, NextResponse } from "next/server";
import { getGmailAuthUrl } from "@/lib/mailbox/gmail";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mailboxId = searchParams.get("mailboxId");
  if (!mailboxId) return NextResponse.json({ error: "mailboxId is required" }, { status: 400 });

  try {
    const url = getGmailAuthUrl(mailboxId);
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google OAuth is not configured" }, { status: 400 });
  }
}
