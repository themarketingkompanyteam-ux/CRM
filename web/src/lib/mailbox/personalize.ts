import { predictNameFromEmail } from "@/lib/name-prediction";

export type PersonalizationFields = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  jobTitle: string | null;
  website: string | null;
};

/**
 * Resolves the best available first name: the contact's real name if we have one, otherwise a
 * guess from their email local-part (same logic as CSV import — "john.smith@x.com" -> "John"),
 * otherwise null (no fabricated name).
 */
export function resolveFirstName(fields: Pick<PersonalizationFields, "firstName" | "email">): string | null {
  const real = fields.firstName?.trim();
  if (real && real.toLowerCase() !== "unknown") return real;
  if (fields.email) {
    const guess = predictNameFromEmail(fields.email);
    if (guess?.firstName) return guess.firstName;
  }
  return null;
}

/** "Hi {name}" when a name is available (real or guessed), otherwise a plain "Hey" — never fabricates a name. */
export function resolveGreeting(fields: Pick<PersonalizationFields, "firstName" | "email">): string {
  const name = resolveFirstName(fields);
  return name ? `Hi ${name}` : "Hey";
}

export function renderTemplate(template: string, fields: PersonalizationFields): string {
  const resolvedFirstName = resolveFirstName(fields) ?? "";
  const values: Record<string, string> = {
    firstName: resolvedFirstName,
    lastName: fields.lastName || "",
    greeting: resolveGreeting(fields),
    companyName: fields.companyName || "",
    jobTitle: fields.jobTitle || "",
    website: fields.website || "",
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}
