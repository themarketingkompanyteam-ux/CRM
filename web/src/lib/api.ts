export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  return res.json();
}

export type Contact = {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  website: string | null;
  location: string | null;
  status: string;
  leadStatus: string;
  notes: string | null;
  companyId: number | null;
  companyName: string | null;
  createdAt: string;
};

export type List = { id: number; name: string; contactCount: number };

export type Company = {
  id: number;
  name: string;
  industry: string | null;
  website: string | null;
  location: string | null;
  contactCount: number;
  dealCount: number;
};

export type Deal = {
  id: number;
  title: string;
  contactId: number | null;
  companyId: number | null;
  value: number;
  stage: string;
  probability: number;
  closeDate: string | null;
  owner: string | null;
  notes: string | null;
  contactName: string | null;
  companyName: string | null;
};

export type DashboardStats = {
  total_contacts: number;
  total_companies: number;
  leads_today: number;
  pipeline_value: number;
  revenue_won: number;
  revenue_lost: number;
  open_deals: number;
  deals_at_risk: number;
  conversion_rate: number;
  by_stage: Record<string, { count: number; value: number }>;
};
