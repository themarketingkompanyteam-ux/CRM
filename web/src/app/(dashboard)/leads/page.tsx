"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type Lead = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  leadStatus: string;
  nextFollowUpAt: string | null;
  lastOutcome: string | null;
  lastNotes: string | null;
  lastCallAt: string | null;
};

type Stats = { hot: number; warm: number; toCall: number; callBack: number; booked: number };

const BUCKETS = [
  { key: "Hot", label: "🔥 Hot Leads" },
  { key: "Warm", label: "🟠 Warm Leads" },
  { key: "CallBack", label: "↩ Call Backs" },
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LeadsPage() {
  const [bucket, setBucket] = useState("Hot");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", bucket],
    queryFn: () => apiFetch<Lead[]>(`/api/leads?bucket=${bucket}`),
  });

  const { data: hotLeads } = useQuery({
    queryKey: ["leads", "Hot"],
    queryFn: () => apiFetch<Lead[]>("/api/leads?bucket=Hot"),
  });
  const { data: warmLeads } = useQuery({
    queryKey: ["leads", "Warm"],
    queryFn: () => apiFetch<Lead[]>("/api/leads?bucket=Warm"),
  });
  const { data: callBackLeads } = useQuery({
    queryKey: ["leads", "CallBack"],
    queryFn: () => apiFetch<Lead[]>("/api/leads?bucket=CallBack"),
  });

  const counts: Record<string, number | undefined> = {
    Hot: hotLeads?.length,
    Warm: warmLeads?.length,
    CallBack: callBackLeads?.length,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Everyone marked Hot, Warm, or due for a callback — from Prospecting calls
        </p>
      </div>

      <Tabs value={bucket} onValueChange={setBucket}>
        <TabsList className="mb-5">
          {BUCKETS.map((b) => (
            <TabsTrigger key={b.key} value={b.key}>
              {b.label} {counts[b.key] !== undefined ? `(${counts[b.key]})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>

        {BUCKETS.map((b) => (
          <TabsContent key={b.key} value={b.key}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
              {!isLoading && (leads?.length ?? 0) === 0 && (
                <div className="text-sm text-muted-foreground">Nothing here yet.</div>
              )}
              {leads?.map((lead) => (
                <div key={lead.id} className="rounded-xl border bg-card p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="font-semibold">{lead.name}</div>
                    <LeadBadge status={lead.leadStatus} />
                  </div>
                  <div className="mb-1 text-sm text-muted-foreground">{lead.companyName || "—"}</div>
                  <div className="mb-2 text-sm">{lead.phone}</div>
                  {lead.lastOutcome && (
                    <div className="mb-1 text-xs text-primary">Last outcome: {lead.lastOutcome}</div>
                  )}
                  {lead.lastNotes && (
                    <div className="mb-2 text-xs italic text-muted-foreground">
                      &quot;{lead.lastNotes}&quot;
                    </div>
                  )}
                  {lead.nextFollowUpAt && (
                    <div className="text-xs text-amber-400">
                      Follow up: {fmtDate(lead.nextFollowUpAt)}
                    </div>
                  )}
                  {lead.lastCallAt && (
                    <div className="text-xs text-muted-foreground">
                      Last called: {fmtDate(lead.lastCallAt)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function LeadBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Hot: "bg-red-950 text-red-400",
    Warm: "bg-amber-950 text-amber-400",
    Cold: "bg-secondary text-muted-foreground",
    Customer: "bg-green-950 text-green-400",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", map[status] ?? map.Cold)}>
      {status}
    </span>
  );
}
