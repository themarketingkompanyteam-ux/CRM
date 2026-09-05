import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    industry: text("industry"),
    website: text("website"),
    location: text("location"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("companies_name_lower_idx").on(table.name),
    index("companies_name_trgm_idx").on(table.name),
  ]
);

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").default(""),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    jobTitle: text("job_title"),
    website: text("website"),
    location: text("location"),
    status: varchar("status", { length: 30 }).default("New").notNull(),
    leadStatus: varchar("lead_status", { length: 20 }).default("Cold").notNull(),
    nameGuessed: integer("name_guessed").default(0).notNull(),
    callAttempts: integer("call_attempts").default(0).notNull(),
    lastCalledAt: timestamp("last_called_at"),
    nextFollowUpAt: timestamp("next_follow_up_at"),
    tags: text("tags"),
    notes: text("notes"),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    companyDomain: text("company_domain"),
    linkedinUrl: text("linkedin_url"),
    enrichmentStatus: varchar("enrichment_status", { length: 30 })
      .default("NOT_ENRICHED")
      .notNull(),
    enrichmentConfidence: integer("enrichment_confidence"),
    enrichmentProvider: varchar("enrichment_provider", { length: 40 }),
    enrichedAt: timestamp("enriched_at"),
    pushedToProspectingEnriched: integer("pushed_to_prospecting_enriched")
      .default(0)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("contacts_email_idx").on(table.email),
    index("contacts_phone_idx").on(table.phone),
    index("contacts_company_idx").on(table.companyId),
    index("contacts_name_idx").on(table.firstName, table.lastName),
    index("contacts_lead_status_idx").on(table.leadStatus),
    index("contacts_enrichment_status_idx").on(table.enrichmentStatus),
  ]
);

/** Multi-value emails with provenance — never blindly overwrites contacts.email. */
export const contactEmails = pgTable(
  "contact_emails",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    type: varchar("type", { length: 20 }).default("unknown"), // primary/secondary/personal/work/unknown
    provider: varchar("provider", { length: 40 }),
    confidence: integer("confidence"),
    verificationStatus: varchar("verification_status", { length: 20 }), // valid/invalid/unknown/risky
    foundAt: timestamp("found_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contact_emails_unique").on(table.contactId, table.email),
    index("contact_emails_contact_idx").on(table.contactId),
  ]
);

/** Multi-value phones with provenance. */
export const contactPhones = pgTable(
  "contact_phones",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 50 }).notNull(),
    type: varchar("type", { length: 20 }).default("unknown"), // primary/mobile/direct/office/unknown
    provider: varchar("provider", { length: 40 }),
    confidence: integer("confidence"),
    foundAt: timestamp("found_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contact_phones_unique").on(table.contactId, table.phone),
    index("contact_phones_contact_idx").on(table.contactId),
  ]
);

export const ENRICHMENT_PROVIDER_KEYS = [
  "prospeo",
  "findymail",
  "bettercontact",
  "datagma",
  "snov",
  "fullenrich",
] as const;

/** Operational status/config per provider. Credentials live in env vars, never here. */
export const enrichmentProviders = pgTable("enrichment_providers", {
  key: varchar("key", { length: 40 }).primaryKey(),
  enabled: integer("enabled").default(1).notNull(),
  priority: integer("priority").default(99).notNull(),
  supportsEmail: integer("supports_email").default(1).notNull(),
  supportsPhone: integer("supports_phone").default(0).notNull(),
  maxDailyUsage: integer("max_daily_usage"),
  maxMonthlyUsage: integer("max_monthly_usage"),
  status: varchar("status", { length: 20 }).default("UNKNOWN").notNull(), // CONNECTED/AUTH_ERROR/RATE_LIMITED/OUT_OF_CREDITS/UNKNOWN
  rateLimitedUntil: timestamp("rate_limited_until"),
  creditsRemaining: integer("credits_remaining"),
  creditsCheckedAt: timestamp("credits_checked_at"),
  lastTestedAt: timestamp("last_tested_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastErrorAt: timestamp("last_error_at"),
  lastErrorMessage: text("last_error_message"),
  usageCount: integer("usage_count").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  failureCount: integer("failure_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ENRICHMENT_QUEUE_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "ENRICHED",
  "NO_MATCH",
  "NEEDS_REVIEW",
  "FAILED",
  "PUSHED_TO_PROSPECTING",
] as const;

export const enrichmentQueue = pgTable(
  "enrichment_queue",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 30 }).default("QUEUED").notNull(),
    source: varchar("source", { length: 30 }).default("manual"), // hot_leads/manual/csv_import/search
    lastProvider: varchar("last_provider", { length: 40 }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("enrichment_queue_contact_unique").on(table.contactId),
    index("enrichment_queue_status_idx").on(table.status),
  ]
);

/** One row per provider attempt — the enrichment history/audit log. Never stores secrets. */
export const enrichmentAttempts = pgTable(
  "enrichment_attempts",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    queueId: integer("queue_id").references(() => enrichmentQueue.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 40 }).notNull(),
    operation: varchar("operation", { length: 30 }).notNull(), // search_email/find_phone/verify_email
    outcome: varchar("outcome", { length: 20 }).notNull(), // SUCCESS/NO_MATCH/RATE_LIMITED/OUT_OF_CREDITS/AUTH_ERROR/FAILED
    resultSummary: jsonb("result_summary").$type<Record<string, unknown>>(),
    confidence: integer("confidence"),
    creditsUsed: integer("credits_used").default(0),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("enrichment_attempts_contact_idx").on(table.contactId),
    index("enrichment_attempts_provider_idx").on(table.provider),
  ]
);

/** Search-new-contact results awaiting user review before becoming a real contact. */
export const enrichmentCandidates = pgTable("enrichment_candidates", {
  id: serial("id").primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  jobTitle: text("job_title"),
  companyName: text("company_name"),
  companyDomain: text("company_domain"),
  linkedinUrl: text("linkedin_url"),
  emails: jsonb("emails").$type<
    { email: string; provider: string; confidence: number; verificationStatus?: string }[]
  >().default([]),
  phones: jsonb("phones").$type<{ phone: string; provider: string; confidence: number }[]>().default([]),
  confidence: integer("confidence"),
  providerSources: jsonb("provider_sources").$type<string[]>().default([]),
  searchQuery: jsonb("search_query").$type<Record<string, string>>(),
  status: varchar("status", { length: 20 }).default("PENDING").notNull(), // PENDING/ADDED/DISMISSED
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lists = pgTable("lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const listMemberships = pgTable(
  "list_memberships",
  {
    id: serial("id").primaryKey(),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("list_memberships_unique").on(table.listId, table.contactId),
    index("list_memberships_contact_idx").on(table.contactId),
  ]
);

export const CALL_OUTCOMES = [
  "No Answer",
  "Voicemail",
  "Call Back Later",
  "Interested",
  "Booked Call",
  "Not Interested",
  "Wrong Number",
  "Requested Information",
  "Other",
] as const;

export const calls = pgTable(
  "calls",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    outcome: varchar("outcome", { length: 40 }),
    leadTemperature: varchar("lead_temperature", { length: 20 }),
    notes: text("notes"),
    durationSeconds: integer("duration_seconds").default(0),
    callbackAt: timestamp("callback_at"),
    twilioCallSid: text("twilio_call_sid"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("calls_contact_idx").on(table.contactId)]
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at"),
    completed: integer("completed").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("tasks_contact_idx").on(table.contactId)]
);

export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const deals = pgTable(
  "deals",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    value: numeric("value", { precision: 12, scale: 2 }).default("0"),
    stage: varchar("stage", { length: 30 }).default("New").notNull(),
    probability: integer("probability").default(20),
    closeDate: text("close_date"),
    owner: text("owner"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("deals_stage_idx").on(table.stage)]
);

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    dealId: integer("deal_id").references(() => deals.id, {
      onDelete: "cascade",
    }),
    type: varchar("type", { length: 30 }).notNull(),
    body: text("body"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("activities_contact_idx").on(table.contactId)]
);

export const importJobs = pgTable("import_jobs", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  createdCount: integer("created_count").default(0),
  updatedCount: integer("updated_count").default(0),
  companiesCreatedCount: integer("companies_created_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  errors: jsonb("errors").$type<string[]>().default([]),
  columnMapping: jsonb("column_mapping").$type<Record<string, string | string[]>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});
