"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Detail = {
  campaign: {
    id: number;
    name: string;
    description: string | null;
    status: string;
    instantlyCampaignId: string | null;
    dailyLimit: number | null;
    stopOnReply: number;
    sendingAccountEmails: string[];
    launchedAt: string | null;
    lastError: string | null;
  };
  steps: { id: number; subject: string; body: string; delayDays: number }[];
  leadStats: { total: number; added: number; sent: number; opened: number; clicked: number; replied: number; bounced: number; unsubscribed: number };
  sendingAccounts: { email: string; statusLabel: string | null; dailyLimit: number | null }[];
  remoteAnalytics: { sent: number; opened: number; clicked: number; replied: number; bounced: number; unsubscribed: number } | null;
};

type LeadRow = {
  id: number;
  contactId: number;
  status: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  lastEventAt: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-950 text-green-400",
  paused: "bg-amber-950 text-amber-400",
  draft: "bg-secondary text-muted-foreground",
  completed: "bg-blue-950 text-blue-400",
  error: "bg-red-950 text-red-400",
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  replied: "bg-green-950 text-green-400",
  bounced: "bg-red-950 text-red-400",
  unsubscribed: "bg-red-950 text-red-400",
  clicked: "bg-blue-950 text-blue-400",
  opened: "bg-blue-950 text-blue-400",
  sent: "bg-secondary text-muted-foreground",
  added: "bg-secondary text-muted-foreground",
  pending: "bg-amber-950 text-amber-400",
};

export default function EmailCampaignDetailPage() {
  const params = useParams();
  const campaignId = Number(params.id);
  const queryClient = useQueryClient();
  const [testEmail, setTestEmail] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["email-campaign", campaignId],
    queryFn: () => apiFetch<Detail>(`/api/email-campaigns/${campaignId}`),
  });

  const { data: leads } = useQuery({
    queryKey: ["email-campaign-leads", campaignId],
    queryFn: () => apiFetch<LeadRow[]>(`/api/email-campaigns/${campaignId}/leads`),
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiFetch(`/api/email-campaigns/${campaignId}/pause`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaign", campaignId] });
      toast.success("Paused");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiFetch(`/api/email-campaigns/${campaignId}/resume`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaign", campaignId] });
      toast.success("Resumed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testSendMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>(`/api/email-campaigns/${campaignId}/test-send`, {
        method: "POST",
        body: JSON.stringify({ to: testEmail, stepIndex: 0 }),
      }),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const { campaign, steps, leadStats, sendingAccounts, remoteAnalytics } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">{campaign.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_COLORS[campaign.status] ?? STATUS_COLORS.draft)}>
            {campaign.status}
          </span>
          {campaign.status === "active" && (
            <Button variant="outline" size="sm" onClick={() => pauseMutation.mutate()}>Pause</Button>
          )}
          {campaign.status === "paused" && (
            <Button variant="outline" size="sm" onClick={() => resumeMutation.mutate()}>Resume</Button>
          )}
        </div>
      </div>

      {campaign.lastError && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-400">{campaign.lastError}</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Leads" value={leadStats.total} />
        <Stat label="Added" value={leadStats.added} />
        <Stat label="Sent" value={remoteAnalytics?.sent ?? leadStats.sent} />
        <Stat label="Opened" value={remoteAnalytics?.opened ?? leadStats.opened} />
        <Stat label="Clicked" value={remoteAnalytics?.clicked ?? leadStats.clicked} />
        <Stat label="Replied" value={remoteAnalytics?.replied ?? leadStats.replied} />
        <Stat label="Bounced" value={remoteAnalytics?.bounced ?? leadStats.bounced} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Sequence</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {steps.map((s, i) => (
            <div key={s.id} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">STEP {i + 1}{i > 0 ? ` — wait ${s.delayDays}d` : ""}</div>
              <div className="mb-1 font-medium">{s.subject}</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{s.body}</p>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input placeholder="you@yourdomain.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="max-w-xs" />
            <Button variant="outline" size="sm" disabled={!testEmail || testSendMutation.isPending} onClick={() => testSendMutation.mutate()}>
              Send Test
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Sending Accounts ({sendingAccounts.length})</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {sendingAccounts.map((a) => (
            <span key={a.email} className="rounded-full border px-3 py-1 text-xs">
              {a.email} · {a.statusLabel ?? "Unknown"}
            </span>
          ))}
          {sendingAccounts.length === 0 && <p className="text-sm text-muted-foreground">No sending accounts assigned.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Leads ({leads?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Email</th>
                  <th className="pb-2 pr-3">Company</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Last event</th>
                </tr>
              </thead>
              <tbody>
                {leads?.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-2 pr-3">{l.firstName} {l.lastName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{l.email}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{l.companyName}</td>
                    <td className="py-2 pr-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", LEAD_STATUS_COLORS[l.status] ?? LEAD_STATUS_COLORS.pending)}>
                        {l.status}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">{l.lastEventAt ? new Date(l.lastEventAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
