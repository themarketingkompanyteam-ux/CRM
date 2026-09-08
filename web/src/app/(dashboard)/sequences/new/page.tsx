"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ListSummary = { id: number; name: string; contactCount: number };
type ListMember = { contactId: number; firstName: string; lastName: string | null; email: string | null };
type Mailbox = {
  id: number;
  email: string;
  domain: string;
  connectionStatus: string;
  warmupStatus: string;
  warmupDay: number;
  warmupDailyLimit: number;
  campaignDailyLimit: number;
  healthStatus: string;
};

function mailboxCapacity(m: Mailbox): number {
  if (m.warmupStatus === "warmed") return m.campaignDailyLimit;
  if (m.warmupStatus === "warming") return m.warmupDailyLimit;
  return 0;
}

function mailboxEligible(m: Mailbox): boolean {
  return m.connectionStatus === "connected" && m.healthStatus !== "paused" && (m.warmupStatus === "warming" || m.warmupStatus === "warmed");
}

export default function NewCampaignPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [audienceMode, setAudienceMode] = useState<"auto" | "list" | "custom">("auto");
  const [autoCount, setAutoCount] = useState(50);
  const [listId, setListId] = useState<number | null>(null);
  const [customIds, setCustomIds] = useState("");
  const [selectedMailboxes, setSelectedMailboxes] = useState<number[]>([]);
  const [subject, setSubject] = useState("Quick question, {{firstName}}");
  const [body, setBody] = useState("{{greeting}},\n\n");
  const [launching, setLaunching] = useState(false);

  const { data: lists } = useQuery({
    queryKey: ["lists"],
    queryFn: () => apiFetch<ListSummary[]>("/api/lists"),
  });

  const { data: listMembers } = useQuery({
    queryKey: ["list-members", listId],
    queryFn: () => apiFetch<ListMember[]>(`/api/lists/${listId}`),
    enabled: audienceMode === "list" && listId !== null,
  });

  const { data: uncontactedCount } = useQuery({
    queryKey: ["uncontacted-count"],
    queryFn: () => apiFetch<{ count: number }>("/api/contacts/uncontacted?countOnly=1"),
    enabled: audienceMode === "auto",
    refetchInterval: 30000,
  });

  const { data: mailboxes } = useQuery({
    queryKey: ["mailboxes"],
    queryFn: () => apiFetch<Mailbox[]>("/api/mailboxes"),
  });

  const audienceSize = (): number => {
    if (audienceMode === "auto") return Math.min(autoCount, uncontactedCount?.count ?? 0);
    if (audienceMode === "list") return (listMembers ?? []).length;
    return customIds.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n) && n > 0).length;
  };

  const totalCapacity = (mailboxes ?? [])
    .filter((m) => selectedMailboxes.includes(m.id))
    .reduce((sum, m) => sum + mailboxCapacity(m), 0);

  async function launch() {
    if (!name || selectedMailboxes.length === 0 || !subject || !body) return;

    setLaunching(true);
    try {
      let contactIds: number[];
      if (audienceMode === "auto") {
        const picked = await apiFetch<{ id: number }[]>(`/api/contacts/uncontacted?limit=${autoCount}`);
        contactIds = picked.map((c) => c.id);
      } else if (audienceMode === "list") {
        contactIds = (listMembers ?? []).map((m) => m.contactId);
      } else {
        contactIds = customIds.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n) && n > 0);
      }

      if (contactIds.length === 0) {
        toast.error("No leads found for this audience");
        setLaunching(false);
        return;
      }

      const created = await apiFetch<{ id: number }>("/api/sequences", { method: "POST", body: JSON.stringify({ name }) });

      await apiFetch(`/api/sequences/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          mailboxIds: selectedMailboxes,
          steps: [{ subject, body, delayDays: 0 }],
          status: "active",
        }),
      });

      const enrollResult = await apiFetch<{ enrolled: number; skipped: number }>(`/api/sequences/${created.id}/enroll`, {
        method: "POST",
        body: JSON.stringify({ contactIds }),
      });

      toast.success(`Campaign launched — ${enrollResult.enrolled} lead(s) enrolled, sending starts within a couple minutes`);
      router.push(`/sequences/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to launch campaign");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">New Email Campaign</h1>
        <p className="text-sm text-muted-foreground">
          Sends through your own connected mailboxes, respecting each one&apos;s warmup limit and health.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">1. Campaign name</CardTitle></CardHeader>
        <CardContent>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Real Estate Outreach — September" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">2. Who to send to</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setAudienceMode("auto")}
              className={cn("rounded-full border px-3 py-1 text-xs", audienceMode === "auto" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
            >
              Auto-pick new leads
            </button>
            <button
              onClick={() => setAudienceMode("list")}
              className={cn("rounded-full border px-3 py-1 text-xs", audienceMode === "list" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
            >
              A saved list
            </button>
            <button
              onClick={() => setAudienceMode("custom")}
              className={cn("rounded-full border px-3 py-1 text-xs", audienceMode === "custom" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
            >
              Custom contact IDs
            </button>
          </div>

          {audienceMode === "auto" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Pulls straight from Contacts — automatically skips anyone who has ever been sent a campaign email
                before (check the Sent Emails page for the full history), anyone currently mid-sequence elsewhere,
                and anyone unsubscribed, bounced, or marked Do Not Contact. Every launch reaches a fresh set.
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-xs">How many leads</Label>
                <Input type="number" className="w-28" value={autoCount} onChange={(e) => setAutoCount(Number(e.target.value))} />
                <span className="text-xs text-muted-foreground">
                  {uncontactedCount ? `${uncontactedCount.count} new lead(s) available` : "checking..."}
                </span>
              </div>
            </div>
          )}

          {audienceMode === "list" && (
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={listId ?? ""}
              onChange={(e) => setListId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select a list...</option>
              {lists?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.contactCount} contacts)
                </option>
              ))}
            </select>
          )}

          {audienceMode === "custom" && (
            <Input value={customIds} onChange={(e) => setCustomIds(e.target.value)} placeholder="Contact IDs, comma-separated (e.g. 101, 102, 103)" />
          )}

          <div className="text-sm text-muted-foreground">Selected: {audienceSize()} lead(s)</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">3. Sending mailboxes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Only mailboxes currently warming or warmed can be selected — capacity is split automatically across
            whichever you check (add more mailboxes here later and they join the rotation on the next send).
          </p>
          {(!mailboxes || mailboxes.length === 0) && (
            <p className="text-sm text-muted-foreground">No mailboxes yet — add one on the Mailboxes page first.</p>
          )}
          <div className="space-y-1.5">
            {mailboxes?.map((m) => {
              const eligible = mailboxEligible(m);
              return (
                <label
                  key={m.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 text-sm",
                    !eligible && "cursor-not-allowed opacity-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={!eligible}
                      checked={selectedMailboxes.includes(m.id)}
                      onChange={(e) =>
                        setSelectedMailboxes(
                          e.target.checked ? [...selectedMailboxes, m.id] : selectedMailboxes.filter((id) => id !== m.id)
                        )
                      }
                    />
                    <span>{m.email}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {eligible
                      ? `${m.warmupStatus === "warming" ? `Warming day ${m.warmupDay}` : "Warmed"} · ${mailboxCapacity(m)}/day`
                      : m.connectionStatus !== "connected"
                        ? "Not connected"
                        : m.healthStatus === "paused"
                          ? "Paused"
                          : "Warmup not started"}
                  </div>
                </label>
              );
            })}
          </div>
          {selectedMailboxes.length > 0 && (
            <div className="rounded-md bg-secondary/40 p-2 text-sm">
              Combined daily capacity: <b>{totalCapacity}/day</b> across {selectedMailboxes.length} mailbox(es)
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">4. What to send</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <textarea
              className="min-h-[160px] w-full rounded-md border bg-background p-2 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            <code>{"{{greeting}}"}</code> becomes &quot;Hi Firstname&quot; when a name is known or can be guessed
            from the email address, or just &quot;Hey&quot; if not — never a fabricated name. Also available:{" "}
            <code>{"{{firstName}}"}</code>, <code>{"{{companyName}}"}</code>, <code>{"{{jobTitle}}"}</code>,{" "}
            <code>{"{{website}}"}</code>.
          </p>
        </CardContent>
      </Card>

      <Button
        className="bg-primary text-primary-foreground"
        disabled={!name || audienceSize() === 0 || selectedMailboxes.length === 0 || !subject || !body || launching}
        onClick={launch}
      >
        {launching ? "Launching..." : "Launch Campaign"}
      </Button>
    </div>
  );
}
