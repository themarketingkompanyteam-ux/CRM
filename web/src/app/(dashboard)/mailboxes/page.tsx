"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Mailbox = {
  id: number;
  email: string;
  domain: string;
  provider: string;
  connectionStatus: string;
  lastConnectionError: string | null;
  warmupStatus: string;
  warmupDay: number;
  warmupDailyLimit: number;
  campaignDailyLimit: number;
  sentToday: number;
  bouncedToday: number;
  repliedToday: number;
  unsubscribesToday: number;
  healthScore: number;
  healthStatus: string;
  healthReasons: string[];
  campaignEnabled: number;
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: "bg-green-950 text-green-400",
  monitoring: "bg-amber-950 text-amber-400",
  throttled: "bg-orange-950 text-orange-400",
  paused: "bg-red-950 text-red-400",
};

const HEALTH_DOT: Record<string, string> = {
  healthy: "🟢",
  monitoring: "🟡",
  throttled: "🟠",
  paused: "🔴",
};

export default function MailboxesPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const connected = searchParams.get("gmail_connected");
    const error = searchParams.get("gmail_error");
    if (connected) toast.success(`Gmail connected: ${connected}`);
    if (error) toast.error(`Gmail connection failed: ${error}`);
  }, [searchParams]);

  const { data: mailboxes, isLoading } = useQuery({
    queryKey: ["mailboxes"],
    queryFn: () => apiFetch<Mailbox[]>("/api/mailboxes"),
    refetchInterval: 15000,
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: boolean; message: string }>(`/api/mailboxes/${id}/test`, { method: "POST" }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    },
  });

  const startWarmupMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/mailboxes/${id}/start-warmup`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast.success("Warmup started — ramping from 5/day");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/mailboxes/${id}/pause`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast.success("Mailbox paused");
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/mailboxes/${id}/resume`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast.success("Mailbox resumed");
    },
  });

  const totals = mailboxes
    ? {
        total: mailboxes.length,
        healthy: mailboxes.filter((m) => m.healthStatus === "healthy").length,
        warming: mailboxes.filter((m) => m.warmupStatus === "warming").length,
        paused: mailboxes.filter((m) => m.healthStatus === "paused").length,
        sentToday: mailboxes.reduce((s, m) => s + m.sentToday, 0),
        bouncedToday: mailboxes.reduce((s, m) => s + m.bouncedToday, 0),
        repliedToday: mailboxes.reduce((s, m) => s + m.repliedToday, 0),
      }
    : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mailboxes</h1>
          <p className="text-sm text-muted-foreground">
            Direct-send mailboxes (Gmail API / SMTP) with rotation, warmup ramp, and health monitoring
          </p>
        </div>
        <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>

      {totals && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Mailboxes" value={totals.total} />
          <Stat label="Healthy" value={totals.healthy} />
          <Stat label="Warming" value={totals.warming} />
          <Stat label="Paused" value={totals.paused} />
          <Stat label="Sent Today" value={totals.sentToday} />
          <Stat label="Bounced Today" value={totals.bouncedToday} />
          <Stat label="Replies Today" value={totals.repliedToday} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-secondary/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Email</th>
                <th className="p-3">Domain</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Connection</th>
                <th className="p-3">Warmup</th>
                <th className="p-3">Daily Limit</th>
                <th className="p-3">Sent Today</th>
                <th className="p-3">Bounce</th>
                <th className="p-3">Health</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
              {!isLoading && (mailboxes?.length ?? 0) === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No mailboxes yet — add one to get started.</td></tr>
              )}
              {mailboxes?.map((m) => {
                const limit = m.warmupStatus === "warmed" ? m.campaignDailyLimit : m.warmupStatus === "warming" ? m.warmupDailyLimit : 0;
                const bounceRate = m.sentToday > 0 ? ((m.bouncedToday / m.sentToday) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={m.id} className="border-t align-top">
                    <td className="p-3 font-medium">{m.email}</td>
                    <td className="p-3">
                      <Link href="/domains" className="text-primary underline">{m.domain}</Link>
                    </td>
                    <td className="p-3 capitalize text-muted-foreground">{m.provider}</td>
                    <td className="p-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", m.connectionStatus === "connected" ? "bg-green-950 text-green-400" : m.connectionStatus === "error" ? "bg-red-950 text-red-400" : "bg-secondary text-muted-foreground")}>
                        {m.connectionStatus}
                      </span>
                      {m.lastConnectionError && <div className="mt-1 max-w-[180px] truncate text-[11px] text-red-400" title={m.lastConnectionError}>{m.lastConnectionError}</div>}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {m.warmupStatus === "warming" ? `Day ${m.warmupDay}` : m.warmupStatus === "warmed" ? "Warmed" : m.warmupStatus === "paused" ? "Paused" : "Not started"}
                    </td>
                    <td className="p-3">{limit}/day</td>
                    <td className="p-3">{m.sentToday}</td>
                    <td className="p-3">{bounceRate}%</td>
                    <td className="p-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", HEALTH_COLORS[m.healthStatus] ?? HEALTH_COLORS.healthy)}>
                        {HEALTH_DOT[m.healthStatus]} {m.healthScore}/100
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {m.connectionStatus !== "connected" && m.provider === "gmail" && (
                          <a href={`/api/mailboxes/oauth/gmail/start?mailboxId=${m.id}`}>
                            <Button size="sm" variant="outline">Connect Gmail</Button>
                          </a>
                        )}
                        {m.connectionStatus !== "connected" && m.provider === "smtp" && <ConnectSmtpDialog mailboxId={m.id} />}
                        <Button size="sm" variant="outline" disabled={testMutation.isPending} onClick={() => testMutation.mutate(m.id)}>
                          Test
                        </Button>
                        {m.warmupStatus === "not_started" && m.connectionStatus === "connected" && (
                          <Button size="sm" variant="outline" disabled={startWarmupMutation.isPending} onClick={() => startWarmupMutation.mutate(m.id)}>
                            Start Warmup
                          </Button>
                        )}
                        {m.healthStatus !== "paused" ? (
                          <Button size="sm" variant="outline" disabled={pauseMutation.isPending} onClick={() => pauseMutation.mutate(m.id)}>
                            Pause
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={resumeMutation.isPending} onClick={() => resumeMutation.mutate(m.id)}>
                            Resume
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        These controls are designed to reduce deliverability risk — they don&apos;t guarantee inbox placement.
      </p>
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

function AddMailboxDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<"gmail" | "smtp">("gmail");
  const [campaignDailyLimit, setCampaignDailyLimit] = useState(30);

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/mailboxes", { method: "POST", body: JSON.stringify({ email, provider, campaignDailyLimit }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast.success("Mailbox added — connect it below");
      setEmail("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button className="bg-primary text-primary-foreground">+ Add Mailbox</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Mailbox</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label>Email address</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="shahab@tmkagency.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Connection method</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={provider} onChange={(e) => setProvider(e.target.value as "gmail" | "smtp")}>
              <option value="gmail">Gmail API (OAuth)</option>
              <option value="smtp">SMTP</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Steady-state campaign daily limit (after warmup)</Label>
            <Input type="number" value={campaignDailyLimit} onChange={(e) => setCampaignDailyLimit(Number(e.target.value))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" disabled={!email || createMutation.isPending} onClick={() => createMutation.mutate()}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConnectSmtpDialog({ mailboxId }: { mailboxId: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);
  const [password, setPassword] = useState("");

  const connectMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>(`/api/mailboxes/${mailboxId}/connect-smtp`, {
        method: "POST",
        body: JSON.stringify({ smtpHost, smtpPort, password }),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
        setPassword("");
      } else {
        toast.error(r.message);
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline">Connect SMTP</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect via SMTP</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label>SMTP host</Label>
            <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div className="space-y-1.5">
            <Label>SMTP port</Label>
            <Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Password / app password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Stored encrypted at rest. Verified before saving — a wrong password won&apos;t be marked connected.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary text-primary-foreground"
              disabled={!smtpHost || !password || connectMutation.isPending}
              onClick={() => connectMutation.mutate()}
            >
              {connectMutation.isPending ? "Verifying..." : "Connect"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
