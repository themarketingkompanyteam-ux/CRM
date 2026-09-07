import { MailboxProvider, MailboxRecord } from "./types";
import { gmailProvider } from "./gmail";
import { smtpProvider } from "./smtp";

export function providerFor(mailbox: MailboxRecord): MailboxProvider {
  return mailbox.provider === "gmail" ? gmailProvider : smtpProvider;
}
