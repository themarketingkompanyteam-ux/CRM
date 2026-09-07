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
    // Growth Intelligence (AI) state
    aiStatus: varchar("ai_status", { length: 30 }).default("NOT_ANALYZED").notNull(),
    aiOpportunityScore: integer("ai_opportunity_score"),
    aiPrimaryOpportunity: text("ai_primary_opportunity"),
    aiRecommendedService: text("ai_recommended_service"),
    aiAnalyzedAt: timestamp("ai_analyzed_at"),
    aiExpiresAt: timestamp("ai_expires_at"),
    aiPushedToProspecting: integer("ai_pushed_to_prospecting").default(0).notNull(),
    aiLastError: text("ai_last_error"),
    // Email outreach (Instantly) suppression state
    emailStatus: varchar("email_status", { length: 20 }).default("none").notNull(),
    emailUnsubscribed: integer("email_unsubscribed").default(0).notNull(),
    emailBounced: integer("email_bounced").default(0).notNull(),
    doNotContact: integer("do_not_contact").default(0).notNull(),
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
    index("contacts_ai_status_idx").on(table.aiStatus),
    index("contacts_ai_score_idx").on(table.aiOpportunityScore),
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

// ---------- Growth Intelligence (Gemini AI layer) ----------

export const AI_STATUSES = [
  "NOT_ANALYZED",
  "QUEUED",
  "RESEARCHING",
  "ANALYZING",
  "OPPORTUNITIES_FOUND",
  "SCORED",
  "SALES_READY",
  "COMPLETED",
  "FAILED",
  "NEEDS_REVIEW",
] as const;

/** Structured company research, cached and reused across later AI stages. */
export const aiResearch = pgTable("ai_research", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" })
    .unique(),
  companySummary: text("company_summary"),
  industry: text("industry"),
  services: jsonb("services").$type<string[]>().default([]),
  locations: jsonb("locations").$type<string[]>().default([]),
  website: text("website"),
  socialProfiles: jsonb("social_profiles").$type<string[]>().default([]),
  reviews: jsonb("reviews").$type<{ text: string; source: string }[]>().default([]),
  recentSignals: jsonb("recent_signals").$type<string[]>().default([]),
  marketingSignals: jsonb("marketing_signals").$type<string[]>().default([]),
  buyingSignals: jsonb("buying_signals")
    .$type<{ signal: string; source: string; date: string | null; confidence: number }[]>()
    .default([]),
  websiteAnalysis: jsonb("website_analysis").$type<Record<string, unknown>>(),
  sources: jsonb("sources").$type<{ url: string; title: string }[]>().default([]),
  promptVersion: varchar("prompt_version", { length: 10 }),
  researchedAt: timestamp("researched_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export const aiOpportunities = pgTable(
  "ai_opportunities",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 40 }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    severity: varchar("severity", { length: 10 }), // LOW/MEDIUM/HIGH
    confidence: integer("confidence"),
    evidence: jsonb("evidence")
      .$type<{ finding: string; sourceUrl: string | null; observedDate: string | null; evidenceType: string; confidence: number }[]>()
      .default([]),
    recommendedService: text("recommended_service"),
    potentialImpact: text("potential_impact"),
    reason: text("reason"),
    promptVersion: varchar("prompt_version", { length: 10 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_opportunities_contact_idx").on(table.contactId)]
);

export const aiScores = pgTable("ai_scores", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" })
    .unique(),
  overallScore: integer("overall_score").notNull(),
  fitScore: integer("fit_score"),
  opportunityScore: integer("opportunity_score"),
  buyingSignalScore: integer("buying_signal_score"),
  dataConfidenceScore: integer("data_confidence_score"),
  urgencyScore: integer("urgency_score"),
  scoreReason: text("score_reason"),
  scoredAt: timestamp("scored_at").defaultNow().notNull(),
});

export const aiSalesBriefs = pgTable("ai_sales_briefs", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" })
    .unique(),
  primaryOpportunity: text("primary_opportunity"),
  secondaryOpportunity: text("secondary_opportunity"),
  buyingSignals: jsonb("buying_signals").$type<string[]>().default([]),
  likelyObjective: text("likely_objective"),
  recommendedService: text("recommended_service"),
  evidence: jsonb("evidence").$type<string[]>().default([]),
  riskFactors: jsonb("risk_factors").$type<string[]>().default([]),
  recommendedApproach: text("recommended_approach"),
  promptVersion: varchar("prompt_version", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const AI_OUTREACH_TYPES = ["cold_email", "followup_email", "linkedin", "sms", "whatsapp"] as const;

export const aiOutreach = pgTable(
  "ai_outreach",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    status: varchar("status", { length: 20 }).default("draft").notNull(), // draft/sent
    promptVersion: varchar("prompt_version", { length: 10 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_outreach_contact_idx").on(table.contactId)]
);

export const aiCallScripts = pgTable("ai_call_scripts", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" })
    .unique(),
  opening: text("opening"),
  whyCalling: text("why_calling"),
  primaryProblem: text("primary_problem"),
  evidence: jsonb("evidence").$type<string[]>().default([]),
  discoveryQuestions: jsonb("discovery_questions").$type<string[]>().default([]),
  recommendedAngle: text("recommended_angle"),
  likelyObjections: jsonb("likely_objections").$type<{ objection: string; response: string }[]>().default([]),
  nextStepRecommendation: text("next_step_recommendation"),
  promptVersion: varchar("prompt_version", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Every Gemini call, for usage tracking and debugging. Never stores the API key. */
export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    operation: varchar("operation", { length: 40 }).notNull(),
    provider: varchar("provider", { length: 20 }).default("gemini").notNull(),
    model: varchar("model", { length: 40 }),
    promptVersion: varchar("prompt_version", { length: 10 }),
    status: varchar("status", { length: 20 }).notNull(), // SUCCESS/FAILED
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_usage_log_contact_idx").on(table.contactId),
    index("ai_usage_log_created_idx").on(table.createdAt),
  ]
);

// ---------- Email Campaigns (Instantly.ai outreach layer) ----------

/** Suppression / deliverability state — checked before any push to Instantly. */
export const EMAIL_STATUSES = ["none", "sent", "bounced", "unsubscribed", "replied", "suppressed"] as const;

export const EMAIL_CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "error"] as const;

export const emailCampaigns = pgTable(
  "email_campaigns",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    instantlyCampaignId: varchar("instantly_campaign_id", { length: 60 }),
    audienceFilter: jsonb("audience_filter").$type<Record<string, unknown>>().default({}),
    personalizationMode: varchar("personalization_mode", { length: 30 }).default("standard").notNull(),
    dailyLimit: integer("daily_limit").default(50),
    stopOnReply: integer("stop_on_reply").default(1).notNull(),
    openTracking: integer("open_tracking").default(1).notNull(),
    linkTracking: integer("link_tracking").default(1).notNull(),
    scheduleDays: jsonb("schedule_days").$type<number[]>().default([1, 2, 3, 4, 5]),
    scheduleFrom: varchar("schedule_from", { length: 5 }).default("09:00"),
    scheduleTo: varchar("schedule_to", { length: 5 }).default("17:00"),
    timezone: varchar("timezone", { length: 60 }).default("Etc/UTC"),
    sendingAccountEmails: jsonb("sending_account_emails").$type<string[]>().default([]),
    lastError: text("last_error"),
    launchedAt: timestamp("launched_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_campaigns_status_idx").on(table.status),
    uniqueIndex("email_campaigns_instantly_id_idx").on(table.instantlyCampaignId),
  ]
);

export const emailCampaignSteps = pgTable(
  "email_campaign_steps",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    delayDays: integer("delay_days").default(2).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("email_campaign_steps_campaign_idx").on(table.campaignId)]
);

/** Maps a CRM contact into a campaign and tracks the Instantly-side lead + its status. */
export const emailCampaignLeads = pgTable(
  "email_campaign_leads",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    instantlyLeadId: varchar("instantly_lead_id", { length: 60 }),
    status: varchar("status", { length: 20 }).default("pending").notNull(), // pending/added/sent/opened/clicked/replied/bounced/unsubscribed/failed
    lastEventAt: timestamp("last_event_at"),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("email_campaign_leads_unique").on(table.campaignId, table.contactId),
    index("email_campaign_leads_contact_idx").on(table.contactId),
    index("email_campaign_leads_instantly_idx").on(table.instantlyLeadId),
  ]
);

/** Read-only local cache of Instantly sending accounts, refreshed on demand. */
export const emailSendingAccounts = pgTable("email_sending_accounts", {
  email: varchar("email", { length: 255 }).primaryKey(),
  status: integer("status"),
  statusLabel: varchar("status_label", { length: 30 }),
  warmupStatus: integer("warmup_status"),
  dailyLimit: integer("daily_limit"),
  tags: jsonb("tags").$type<string[]>().default([]),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

// ---------- Domains (DNS authentication health, feeds the mailbox compliance gate) ----------

export const DOMAIN_CHECK_STATUSES = ["pass", "fail", "unknown"] as const;

export const domains = pgTable("domains", {
  id: serial("id").primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  dkimSelector: varchar("dkim_selector", { length: 100 }),
  mxStatus: varchar("mx_status", { length: 10 }).default("unknown").notNull(),
  spfStatus: varchar("spf_status", { length: 10 }).default("unknown").notNull(),
  dkimStatus: varchar("dkim_status", { length: 10 }).default("unknown").notNull(),
  dmarcStatus: varchar("dmarc_status", { length: 10 }).default("unknown").notNull(),
  checkReasons: jsonb("check_reasons").$type<string[]>().default([]),
  domainHealthScore: integer("domain_health_score").default(0).notNull(),
  // Escape hatch for domains you don't control the DNS of (e.g. testing with a personal
  // @gmail.com address) — DKIM can never be verified there. Off by default; leaving it off for
  // any domain you actually own and send real campaigns from is the whole point of the gate.
  dkimOptional: integer("dkim_optional").default(0).notNull(),
  notes: text("notes"),
  dnsLastCheckedAt: timestamp("dns_last_checked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Direct-send Mailbox Engine (Gmail API / SMTP, no third-party ESP) ----------

export const MAILBOX_PROVIDERS = ["gmail", "smtp"] as const;
export const MAILBOX_CONNECTION_STATUSES = ["disconnected", "connected", "error"] as const;
export const MAILBOX_WARMUP_STATUSES = ["not_started", "warming", "warmed", "paused"] as const;

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    domain: text("domain").notNull(),
    domainId: integer("domain_id").references(() => domains.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 10 }).notNull(), // gmail | smtp
    firstName: text("first_name"),
    lastName: text("last_name"),
    // Gmail OAuth (encrypted at rest — see lib/mailbox/crypto.ts). Never sent to the frontend.
    oauthRefreshTokenEnc: text("oauth_refresh_token_enc"),
    // SMTP/IMAP (encrypted at rest).
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpPasswordEnc: text("smtp_password_enc"),
    imapHost: text("imap_host"),
    imapPort: integer("imap_port"),
    connectionStatus: varchar("connection_status", { length: 20 }).default("disconnected").notNull(),
    lastConnectionError: text("last_connection_error"),
    // Warmup / ramp
    warmupStatus: varchar("warmup_status", { length: 20 }).default("not_started").notNull(),
    warmupStartedAt: timestamp("warmup_started_at"),
    warmupDay: integer("warmup_day").default(0).notNull(),
    warmupDailyLimit: integer("warmup_daily_limit").default(5).notNull(),
    // Capacity: total = warmup allocation + campaign allocation, enforced separately.
    campaignDailyLimit: integer("campaign_daily_limit").default(30).notNull(),
    // Daily counters, reset by the reset-daily-counters job.
    sentToday: integer("sent_today").default(0).notNull(),
    deliveredToday: integer("delivered_today").default(0).notNull(),
    bouncedToday: integer("bounced_today").default(0).notNull(),
    repliedToday: integer("replied_today").default(0).notNull(),
    unsubscribesToday: integer("unsubscribes_today").default(0).notNull(),
    countersResetAt: timestamp("counters_reset_at").defaultNow().notNull(),
    // Health
    healthScore: integer("health_score").default(100).notNull(),
    healthStatus: varchar("health_status", { length: 20 }).default("healthy").notNull(), // healthy/monitoring/throttled/paused
    healthReasons: jsonb("health_reasons").$type<string[]>().default([]),
    lastHealthCheckAt: timestamp("last_health_check_at"),
    campaignEnabled: integer("campaign_enabled").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mailboxes_domain_idx").on(table.domain),
    index("mailboxes_domain_id_idx").on(table.domainId),
    index("mailboxes_connection_status_idx").on(table.connectionStatus),
    index("mailboxes_health_status_idx").on(table.healthStatus),
  ]
);

export const MAILBOX_SEND_STATUSES = ["sent", "failed", "bounced"] as const;

export const mailboxSendLog = pgTable(
  "mailbox_send_log",
  {
    id: serial("id").primaryKey(),
    mailboxId: integer("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    sequenceEnrollmentId: integer("sequence_enrollment_id"),
    subject: text("subject").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [
    index("mailbox_send_log_mailbox_idx").on(table.mailboxId),
    index("mailbox_send_log_contact_idx").on(table.contactId),
    index("mailbox_send_log_sent_at_idx").on(table.sentAt),
  ]
);

/** Per-mailbox audit trail of warmup/health/pause decisions, for the "why did this pause" log. */
export const mailboxAuditLog = pgTable(
  "mailbox_audit_log",
  {
    id: serial("id").primaryKey(),
    mailboxId: integer("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 40 }).notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("mailbox_audit_log_mailbox_idx").on(table.mailboxId)]
);

export const SEQUENCE_STATUSES = ["draft", "active", "paused"] as const;

export const sequences = pgTable("sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: serial("id").primaryKey(),
    sequenceId: integer("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    delayDays: integer("delay_days").default(3).notNull(),
  },
  (table) => [index("sequence_steps_sequence_idx").on(table.sequenceId)]
);

export const SEQUENCE_ENROLLMENT_STATUSES = [
  "active",
  "completed",
  "stopped_reply",
  "stopped_bounce",
  "stopped_unsubscribe",
  "stopped_manual",
] as const;

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: serial("id").primaryKey(),
    sequenceId: integer("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    currentStep: integer("current_step").default(0).notNull(),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    nextSendAt: timestamp("next_send_at").defaultNow().notNull(),
    lastSentAt: timestamp("last_sent_at"),
    enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sequence_enrollments_unique").on(table.sequenceId, table.contactId),
    index("sequence_enrollments_status_idx").on(table.status),
    index("sequence_enrollments_next_send_idx").on(table.nextSendAt),
  ]
);
