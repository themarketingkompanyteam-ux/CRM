import nodemailer from "nodemailer";
import { MailboxProvider, SendResult } from "./types";
import { decryptSecret } from "./crypto";

function transportFor(mailbox: { email: string; smtpHost: string | null; smtpPort: number | null; smtpPasswordEnc: string | null }) {
  if (!mailbox.smtpHost || !mailbox.smtpPort || !mailbox.smtpPasswordEnc) {
    throw new Error("Mailbox is missing SMTP host/port/password");
  }
  return nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpPort === 465,
    auth: {
      user: mailbox.email,
      pass: decryptSecret(mailbox.smtpPasswordEnc),
    },
  });
}

export const smtpProvider: MailboxProvider = {
  key: "smtp",

  async testConnection(mailbox) {
    try {
      const transport = transportFor(mailbox);
      await transport.verify();
      return { ok: true, message: `SMTP connection verified for ${mailbox.email}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "SMTP connection failed" };
    }
  },

  async sendEmail(mailbox, { to, subject, body }): Promise<SendResult> {
    try {
      const transport = transportFor(mailbox);
      const info = await transport.sendMail({ from: mailbox.email, to, subject, text: body });
      return { ok: true, providerMessageId: info.messageId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "SMTP send failed" };
    }
  },
};
