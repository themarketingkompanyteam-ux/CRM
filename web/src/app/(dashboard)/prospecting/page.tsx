"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CallDialog, CallLead } from "@/components/call-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type QueueLead = CallLead & {
  email: string | null;
  leadStatus: string;
  callAttempts: number;
};

type EnrichedLead = {
  id: number;
  name: string;
  jobTitle: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  leadStatus: string;
  confidence: number | null;
  provider: string | null;
  enrichedAt: string | null;
  lastCalledAt: string | null;
};

type Stats = { hot: number; warm: number; toCall: number; callBack: number; booked: number };

export default function ProspectingPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("regular");
  const { data: stats } = useQuery({
    queryKey: ["prospecting-stats"],
    queryFn: () => apiFetch<Stats>("/api/prospecting/stats"),
    refetchInterval: 10000,
  });
  const { data: queue, isLoading } = useQuery({
    queryKey: ["prospecting-queue"],
    queryFn: () => apiFetch<QueueLead[]>("/api/prospecting/queue"),
  });
  const { data: enrichedLeads, isLoading: enrichedLoading } = useQuery({
    queryKey: ["prospecting-enriched"],
    queryFn: () => apiFetch<EnrichedLead[]>("/api/prospecting/enriched"),
  });

  const [activeLead, setActiveLead] = useState<CallLead | null>(null);

  async function getNextInQueue(currentId: number): Promise<CallLead | null> {
    const freshQueue = await queryClient.fetchQuery({
      queryKey: ["prospecting-queue"],
      queryFn: () => apiFetch<QueueLead[]>("/api/prospecting/queue"),
    });
    const remaining = freshQueue.filter((l) => l.id !== currentId);
    return remaining[0] ?? null;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Prospecting</h1>
        <p className="text-sm text-muted-foreground">Today</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3.5 rounded-xl border bg-card p-5">
        <StatPill icon="🔥" label="Hot" value={stats?.hot} />
        <StatPill icon="🟠" label="Warm" value={stats?.warm} />
        <StatPill icon="📞" label="To Call" value={stats?.toCall} />
        <StatPill icon="↩" label="Call Back" value={stats?.callBack} />
        <StatPill icon="📅" label="Booked" value={stats?.booked} />
        <div className="ml-auto">
          <Button
            className="bg-primary text-primary-foreground"
            disabled={!queue || queue.length === 0}
            onClick={() => queue && queue[0] && setActiveLead(queue[0])}
          >
            Start Calling
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="regular">Regular Leads</TabsTrigger>
          <TabsTrigger value="enriched">Enriched Leads {enrichedLeads ? `(${enrichedLeads.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="regular">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">TODAY&apos;S CALLS</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading && <div className="text-sm text-muted-foreground">Loading queue...</div>}
            {!isLoading && (queue?.length ?? 0) === 0 && (
              <div className="text-sm text-muted-foreground">
                Nothing left to call today — everyone&apos;s been contacted or has no phone number.
              </div>
            )}
            {queue?.map((lead) => (
              <div key={lead.id} className="rounded-xl border bg-card p-4">
                <div className="mb-1 flex items-center justify-between">
                  <div className="font-semibold">{lead.firstName} {lead.lastName}</div>
                  <TempBadge status={lead.leadStatus} />
                </div>
                <div className="mb-1 text-sm text-muted-foreground">{lead.companyName || "—"}</div>
                <div className="mb-3 text-sm">{lead.phone}</div>
                <div className="mb-3 text-xs text-muted-foreground">
                  {lead.callAttempts > 0 ? `Previous: ${lead.callAttempts} attempt(s)` : "Previous: Never called"}
                </div>
                <Button className="w-full bg-primary text-primary-foreground" onClick={() => setActiveLead(lead)}>
                  📞 Call
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="enriched">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            ENRICHED LEADS — pushed from the Enrichment page
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enrichedLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
            {!enrichedLoading && (enrichedLeads?.length ?? 0) === 0 && (
              <div className="text-sm text-muted-foreground">
                No enriched leads yet — enrich contacts on the Enrichment page and push them here.
              </div>
            )}
            {enrichedLeads?.map((lead) => (
              <div key={lead.id} className="rounded-xl border bg-card p-4">
                <div className="mb-1 flex items-center justify-between">
                  <div className="font-semibold">{lead.name}</div>
                  <TempBadge status={lead.leadStatus} />
                </div>
                <div className="mb-1 text-sm text-muted-foreground">
                  {lead.jobTitle} {lead.jobTitle && lead.companyName ? "·" : ""} {lead.companyName}
                </div>
                {lead.email && <div className="mb-1 text-sm">{lead.email}</div>}
                {lead.phone && <div className="mb-2 text-sm">{lead.phone}</div>}
                {lead.confidence !== null && (
                  <div className="mb-2 text-xs text-primary">
                    Confidence: {lead.confidence}% · {lead.provider}
                  </div>
                )}
                <Button
                  className="w-full bg-primary text-primary-foreground"
                  disabled={!lead.phone}
                  onClick={() =>
                    setActiveLead({ id: lead.id, firstName: lead.name, lastName: null, phone: lead.phone, companyName: lead.companyName })
                  }
                >
                  📞 {lead.phone ? "Start Call" : "No phone"}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <CallDialog lead={activeLead} onClose={() => setActiveLead(null)} getNext={tab === "regular" ? getNextInQueue : undefined} />
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: string; label: string; value?: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <span>{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value ?? "—"}</span>
    </div>
  );
}

function TempBadge({ status }: { status: string }) {
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
