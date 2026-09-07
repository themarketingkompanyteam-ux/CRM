import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";
import { exchangeGmailCode } from "@/lib/mailbox/gmail";
import { encryptSecret } from "@/lib/mailbox/crypto";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const mailboxId = Number(searchParams.get("state"));
  const error = searchParams.get("error");

  const redirectBase = new URL("/mailboxes", request.url);

  if (error) {
    redirectBase.searchParams.set("gmail_error", error);
    return NextResponse.redirect(redirectBase);
  }
  if (!code || !mailboxId) {
    redirectBase.searchParams.set("gmail_error", "missing_code_or_state");
    return NextResponse.redirect(redirectBase);
  }

  try {
    const { refreshToken, email } = await exchangeGmailCode(code);
    const oauthRefreshTokenEnc = encryptSecret(refreshToken);

    await db
      .update(mailboxes)
      .set({
        oauthRefreshTokenEnc,
        connectionStatus: "connected",
        lastConnectionError: null,
        updatedAt: new Date(),
      })
      .where(eq(mailboxes.id, mailboxId));

    redirectBase.searchParams.set("gmail_connected", email);
    return NextResponse.redirect(redirectBase);
  } catch (e) {
    await db
      .update(mailboxes)
      .set({ connectionStatus: "error", lastConnectionError: e instanceof Error ? e.message : "OAuth exchange failed" })
      .where(eq(mailboxes.id, mailboxId));
    redirectBase.searchParams.set("gmail_error", e instanceof Error ? e.message : "oauth_failed");
    return NextResponse.redirect(redirectBase);
  }
}
