import { google } from "googleapis";
import { MailboxProvider, MailboxRecord, SendResult } from "./types";
import { decryptSecret } from "./crypto";

const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email"];

function isConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI);
}

function oauthClient() {
  if (!isConfigured()) throw new Error("Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET/GOOGLE_OAUTH_REDIRECT_URI)");
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI);
}

/** state carries the mailbox id (or "new") through the OAuth round trip. */
export function getGmailAuthUrl(state: string): string {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force refresh_token issuance even on repeat connects
    scope: SCOPES,
    state,
  });
}

export async function exchangeGmailCode(code: string): Promise<{ refreshToken: string; email: string }> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token — remove app access at myaccount.google.com/permissions and reconnect");
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) throw new Error("Could not read the connected account's email address from Google");
  return { refreshToken: tokens.refresh_token, email: data.email };
}

function clientFor(mailbox: MailboxRecord) {
  if (!mailbox.oauthRefreshTokenEnc) throw new Error("Mailbox has no Gmail OAuth connection");
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptSecret(mailbox.oauthRefreshTokenEnc) });
  return client;
}

function buildRawMessage(from: string, to: string, subject: string, body: string): string {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

export const gmailProvider: MailboxProvider = {
  key: "gmail",

  async testConnection(mailbox) {
    if (!isConfigured()) return { ok: false, message: "Google OAuth is not configured yet (missing GOOGLE_CLIENT_ID/SECRET)." };
    try {
      const auth = clientFor(mailbox);
      const gmail = google.gmail({ version: "v1", auth });
      const profile = await gmail.users.getProfile({ userId: "me" });
      return { ok: true, message: `Connected as ${profile.data.emailAddress}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Gmail connection failed" };
    }
  },

  async sendEmail(mailbox, { to, subject, body }): Promise<SendResult> {
    try {
      const auth = clientFor(mailbox);
      const gmail = google.gmail({ version: "v1", auth });
      const raw = buildRawMessage(mailbox.email, to, subject, body);
      const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      return { ok: true, providerMessageId: res.data.id ?? undefined };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Gmail send failed" };
    }
  },
};

export { isConfigured as isGmailOAuthConfigured };
