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
    tags: text("tags"),
    notes: text("notes"),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("contacts_email_idx").on(table.email),
    index("contacts_phone_idx").on(table.phone),
    index("contacts_company_idx").on(table.companyId),
    index("contacts_name_idx").on(table.firstName, table.lastName),
  ]
);

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
  columnMapping: jsonb("column_mapping").$type<Record<string, string>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});
