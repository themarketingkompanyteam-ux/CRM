"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, DashboardStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STAGES = ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

type HotLead = { id: number; name: string; companyName: string | null; lastOutcome: string | null };

function fmtMoney(n: number) {
  return "$" + Math.round(n).toLocaleString();
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardStats>("/api/dashboard"),
    refetchInterval: 15000,
  });

  const { data: hotLeads } = useQuery({
    queryKey: ["hot-leads"],
    queryFn: () => apiFetch<HotLead[]>("/api/prospecting/hot"),
    refetchInterval: 15000,
  });

  const stats = [
    { label: "Pipeline Value", value: data ? fmtMoney(data.pipeline_value) : "—", color: "text-primary" },
    { label: "Revenue Won", value: data ? fmtMoney(data.revenue_won) : "—", color: "text-green-400" },
    { label: "Revenue Lost", value: data ? fmtMoney(data.revenue_lost) : "—", color: "text-red-400" },
    { label: "Leads Today", value: data?.leads_today ?? "—" },
    { label: "Open Deals", value: data?.open_deals ?? "—" },
    { label: "Deals At Risk", value: data?.deals_at_risk ?? "—", color: "text-red-400" },
    { label: "Conversion Rate", value: data ? `${data.conversion_rate}%` : "—" },
    { label: "Total Contacts", value: data?.total_contacts ?? "—" },
    { label: "Companies", value: data?.total_companies ?? "—" },
  ];

  const maxVal = data
    ? Math.max(1, ...Object.values(data.by_stage).map((s) => s.value))
    : 1;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your pipeline at a glance</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="py-4">
            <CardContent className="px-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
              <div className={`mt-1.5 text-2xl font-bold ${s.color ?? ""}`}>
                {isLoading ? "…" : s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">📊 Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {STAGES.map((stage) => {
              const info = data?.by_stage[stage] ?? { count: 0, value: 0 };
              const pct = (info.value / maxVal) * 100;
              return (
                <div key={stage} className="flex items-center gap-2.5 text-sm">
                  <div className="w-28 shrink-0 text-muted-foreground">{stage}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-secondary">
                    <div
                      className="h-full rounded bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-32 shrink-0 text-right">
                    {fmtMoney(info.value)} ({info.count})
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">🔥 Hot Leads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(!hotLeads || hotLeads.length === 0) && (
              <p className="text-sm text-muted-foreground">No hot leads yet — mark some during Prospecting calls.</p>
            )}
            {hotLeads?.map((lead) => (
              <div key={lead.id} className="rounded-lg border p-3">
                <div className="text-sm font-semibold">{lead.name}</div>
                <div className="text-xs text-muted-foreground">{lead.companyName || "—"}</div>
                {lead.lastOutcome && (
                  <div className="mt-1 text-xs text-primary">{lead.lastOutcome}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
