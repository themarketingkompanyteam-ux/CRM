const ALIASES: Record<string, string[]> = {
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  fullName: ["name", "full name", "contact name"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "cell"],
  company: ["company", "company name", "organization"],
  jobTitle: ["job title", "title", "position"],
  website: ["website", "site", "url"],
  location: ["location", "city", "address"],
  notes: ["notes", "note"],
};

export function detectColumnMapping(headers: string[]): Record<string, string> {
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());
  const mapping: Record<string, string> = {};

  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const idx = lowerHeaders.indexOf(alias);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }

  return mapping;
}

export function extractRow(
  row: Record<string, string>,
  mapping: Record<string, string>
) {
  const get = (field: string) => {
    const col = mapping[field];
    if (!col) return "";
    const val = row[col];
    return val ? String(val).trim() : "";
  };

  let firstName = get("firstName");
  let lastName = get("lastName");
  const fullName = get("fullName");

  if (!firstName && fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] ?? fullName;
    lastName = parts.slice(1).join(" ");
  }

  return {
    firstName: firstName || "Unknown",
    lastName,
    email: get("email"),
    phone: get("phone"),
    company: get("company"),
    jobTitle: get("jobTitle"),
    website: get("website"),
    location: get("location"),
    notes: get("notes"),
  };
}
