export interface EnrichmentSearchInput {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyName?: string;
  companyDomain?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  location?: string;
  email?: string;
  phone?: string;
}

export interface EnrichedEmail {
  email: string;
  confidence: number;
  verificationStatus?: "valid" | "invalid" | "unknown" | "risky";
}

export interface EnrichedPhone {
  phone: string;
  confidence: number;
}

export interface EnrichmentResult {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  emails: EnrichedEmail[];
  phones: EnrichedPhone[];
  /** Provider's own confidence, 0-100. Never fabricated if provider gives none. */
  confidence: number;
  provider: string;
}

export type ProviderOutcome =
  | "SUCCESS"
  | "NO_MATCH"
  | "RATE_LIMITED"
  | "OUT_OF_CREDITS"
  | "AUTH_ERROR"
  | "FAILED";

export interface ProviderCallResult {
  outcome: ProviderOutcome;
  result?: EnrichmentResult;
  creditsUsed?: number;
  errorMessage?: string;
  durationMs: number;
}

export interface CreditsInfo {
  /** null when the provider doesn't expose a balance endpoint. */
  remaining: number | null;
}

export interface EnrichmentAdapter {
  key: string;
  label: string;
  supportsEmail: boolean;
  supportsPhone: boolean;
  configured: boolean;
  searchContact(input: EnrichmentSearchInput): Promise<ProviderCallResult>;
  findPhone?(input: EnrichmentSearchInput): Promise<ProviderCallResult>;
  verifyEmail?(email: string): Promise<ProviderCallResult>;
  getCredits(): Promise<CreditsInfo>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
