import crypto from "crypto";

function key(): Buffer {
  const b64 = process.env.MAILBOX_ENCRYPTION_KEY;
  if (!b64) throw new Error("MAILBOX_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) throw new Error("MAILBOX_ENCRYPTION_KEY must decode to 32 bytes (AES-256)");
  return buf;
}

/** AES-256-GCM, output as base64(iv):base64(authTag):base64(ciphertext). Never log the input or output. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}
