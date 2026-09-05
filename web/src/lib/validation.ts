import { z } from "zod";

const optionalStr = z
  .string()
  .nullish()
  .transform((v) => v ?? "");

export const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: optionalStr,
  email: optionalStr,
  phone: optionalStr,
  jobTitle: optionalStr,
  website: optionalStr,
  location: optionalStr,
  notes: optionalStr,
  companyId: z.number().int().nullable().optional(),
});

export const companySchema = z.object({
  name: z.string().min(1),
  industry: optionalStr,
  website: optionalStr,
  location: optionalStr,
});

export const dealSchema = z.object({
  title: z.string().min(1),
  contactId: z.number().int().nullable().optional(),
  companyId: z.number().int().nullable().optional(),
  value: z.number().default(0),
  stage: z.string().default("New"),
  probability: z.number().int().default(20),
  closeDate: optionalStr,
  owner: optionalStr,
  notes: optionalStr,
});
