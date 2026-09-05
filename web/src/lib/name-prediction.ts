const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "aol.com", "live.com", "msn.com", "protonmail.com", "mail.com",
]);

function titleCase(s: string): string {
  return s
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Guess first/last name from an email local-part like "john.smith", "j_smith", "johnsmith". */
export function predictNameFromEmail(email: string): { firstName: string; lastName: string } | null {
  const local = email.split("@")[0];
  if (!local) return null;

  const parts = local.split(/[._\-+]/).filter((p) => p.length > 0 && !/^\d+$/.test(p));

  if (parts.length >= 2) {
    return {
      firstName: titleCase(parts[0]),
      lastName: titleCase(parts.slice(1).join(" ")),
    };
  }

  if (parts.length === 1 && parts[0].length >= 4 && !/\d/.test(parts[0])) {
    // Best-effort split of "johnsmith" is unreliable; just use it as a first name.
    return { firstName: titleCase(parts[0]), lastName: "" };
  }

  return null;
}

/** Guess a company name from an email domain, skipping free consumer providers. */
export function predictCompanyFromEmail(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;

  const base = domain.replace(/\.(com|net|org|io|co|biz|us|info)(\.[a-z]{2})?$/i, "");
  const cleaned = base.split(".")[0].replace(/[-_]+/g, " ");
  if (!cleaned) return null;

  return titleCase(cleaned);
}
