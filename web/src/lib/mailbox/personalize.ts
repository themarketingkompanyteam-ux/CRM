export type PersonalizationFields = {
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  website: string | null;
};

export function renderTemplate(template: string, fields: PersonalizationFields): string {
  const values: Record<string, string> = {
    firstName: fields.firstName || "",
    lastName: fields.lastName || "",
    companyName: fields.companyName || "",
    jobTitle: fields.jobTitle || "",
    website: fields.website || "",
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}
