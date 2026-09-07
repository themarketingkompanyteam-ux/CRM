export type MailboxRecord = {
  id: number;
  email: string;
  provider: string;
  oauthRefreshTokenEnc: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpPasswordEnc: string | null;
};

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface MailboxProvider {
  key: "gmail" | "smtp";
  testConnection(mailbox: MailboxRecord): Promise<{ ok: boolean; message: string }>;
  sendEmail(mailbox: MailboxRecord, params: { to: string; subject: string; body: string }): Promise<SendResult>;
}
