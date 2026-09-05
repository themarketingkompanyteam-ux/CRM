export type EmailAccountStatusCode = 1 | 2 | 3 | -1 | -2 | -3;

export interface EmailAccount {
  email: string;
  status: EmailAccountStatusCode | null;
  statusLabel: string;
  warmupStatus: number | null;
  dailyLimit: number | null;
  tags: string[];
}

export interface EmailCampaignStep {
  subject: string;
  body: string;
  delayDays: number;
}

export interface EmailCampaignSchedule {
  days: number[]; // 0=Sun..6=Sat
  from: string; // "HH:MM"
  to: string; // "HH:MM"
  timezone: string;
}

export interface CreateCampaignParams {
  name: string;
  steps: EmailCampaignStep[];
  sendingAccountEmails: string[];
  dailyLimit: number;
  stopOnReply: boolean;
  openTracking: boolean;
  linkTracking: boolean;
  schedule: EmailCampaignSchedule;
}

export interface RemoteCampaign {
  id: string;
  name: string;
  status: number;
  timestampCreated: string;
}

export interface CampaignAnalytics {
  campaignId: string;
  leadsCount: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
}

export interface AddLeadParams {
  contactId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  website: string | null;
  customVariables?: Record<string, string | number | boolean | null>;
}

export interface AddLeadsResult {
  totalSent: number;
  leadsUploaded: number;
  duplicateEmailCount: number;
  invalidEmailCount: number;
  inBlocklist: number;
  createdLeads: { id: string; email: string | null; index: number }[];
}

export interface EmailProvider {
  key: string;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  listAccounts(): Promise<EmailAccount[]>;
  listCampaigns(): Promise<RemoteCampaign[]>;
  getCampaign(id: string): Promise<RemoteCampaign | null>;
  createCampaign(params: CreateCampaignParams): Promise<RemoteCampaign>;
  updateCampaign(id: string, params: Partial<CreateCampaignParams>): Promise<void>;
  pauseCampaign(id: string): Promise<void>;
  resumeCampaign(id: string): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  addLeads(campaignId: string, leads: AddLeadParams[]): Promise<AddLeadsResult>;
  getCampaignAnalytics(id: string): Promise<CampaignAnalytics | null>;
  sendTestEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; message: string }>;
}
