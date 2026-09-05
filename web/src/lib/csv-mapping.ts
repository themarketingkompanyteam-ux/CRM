const SINGLE_ALIASES: Record<string, string[]> = {
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  fullName: ["name", "full name", "contact name"],
  company: ["company", "company name", "organization"],
  jobTitle: ["job title", "title", "position"],
  website: ["website", "site", "url", "company domain"],
  location: ["location", "city", "address"],
  notes: ["notes", "note"],
};

// Real-world exports (lead scrapers, CRM exports) often have several
// email/phone-shaped columns with messy names ("Most probable work email",
// "All work emails", "Mobile Phone 1", ...). Instead of one exact alias,
// collect every plausible column and try them in priority order per row.
const EMAIL_KEYWORDS = ["email"];
const PHONE_KEYWORDS = ["phone", "mobile", "cell", "whatsapp"];

// Substrings that push a column earlier/later in priority when multiple
// candidates match — e.g. prefer "most probable work email" and
// "valid work emails" over "catch-all" or "invalid" ones.
const GOOD_HINTS = ["most probable", "primary", "valid", "verified"];
const BAD_HINTS = ["invalid", "catch-all", "catch all", "status"];

function rankCandidates(headers: string[], keywords: string[]): string[] {
  const matches = headers.filter((h) =>
    keywords.some((k) => h.toLowerCase().includes(k))
  );
  return matches.sort((a, b) => score(b) - score(a));

  function score(header: string) {
    const lower = header.toLowerCase();
    let s = 0;
    if (GOOD_HINTS.some((h) => lower.includes(h))) s += 2;
    if (BAD_HINTS.some((h) => lower.includes(h))) s -= 2;
    return s;
  }
}

export type ColumnMapping = Record<string, string> & {
  __emailCandidates?: string[];
  __phoneCandidates?: string[];
};

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());
  const mapping: ColumnMapping = {};

  for (const [field, aliases] of Object.entries(SINGLE_ALIASES)) {
    for (const alias of aliases) {
      const idx = lowerHeaders.indexOf(alias);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }

  const emailCandidates = rankCandidates(headers, EMAIL_KEYWORDS);
  const phoneCandidates = rankCandidates(headers, PHONE_KEYWORDS);

  if (emailCandidates[0]) mapping.email = emailCandidates[0];
  if (phoneCandidates[0]) mapping.phone = phoneCandidates[0];
  mapping.__emailCandidates = emailCandidates;
  mapping.__phoneCandidates = phoneCandidates;

  return mapping;
}

const BLANK_VALUES = new Set(["null", "n/a", "na", "none", "undefined", "-", "--"]);

function clean(val: unknown): string {
  const s = val ? String(val).trim() : "";
  return BLANK_VALUES.has(s.toLowerCase()) ? "" : s;
}

function firstNonEmpty(row: Record<string, string>, columns: string[]): string {
  for (const col of columns) {
    const val = clean(row[col]);
    if (val) return val;
  }
  return "";
}

export function extractRow(row: Record<string, string>, mapping: ColumnMapping) {
  const get = (field: string) => {
    const col = mapping[field];
    if (!col) return "";
    return clean(row[col]);
  };

  let firstName = get("firstName");
  let lastName = get("lastName");
  const fullName = get("fullName");

  if (!firstName && fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] ?? fullName;
    lastName = parts.slice(1).join(" ");
  }

  const email = firstNonEmpty(row, mapping.__emailCandidates ?? []);
  const phone = firstNonEmpty(row, mapping.__phoneCandidates ?? []);

  return {
    firstName: firstName || "Unknown",
    lastName,
    email,
    phone,
    company: get("company"),
    jobTitle: get("jobTitle"),
    website: get("website"),
    location: get("location"),
    notes: get("notes"),
  };
}
