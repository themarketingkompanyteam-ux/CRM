"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type QueueLead = {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  leadStatus: string;
  callAttempts: number;
};

type Stats = { hot: number; warm: number; toCall: number; callBack: number; booked: number };

const OUTCOMES = [
  "No Answer",
  "Voicemail",
  "Call Back Later",
  "Interested",
  "Booked Call",
  "Not Interested",
  "Wrong Number",
  "Requested Information",
  "Other",
];

const TEMPERATURES = ["Cold", "Warm", "Hot"];

function fmtDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function ProspectingPage() {
  const queryClient = useQueryClient();
  const { data: stats } = useQuery({
    queryKey: ["prospecting-stats"],
    queryFn: () => apiFetch<Stats>("/api/prospecting/stats"),
    refetchInterval: 10000,
  });
  const { data: queue, isLoading } = useQuery({
    queryKey: ["prospecting-queue"],
    queryFn: () => apiFetch<QueueLead[]>("/api/prospecting/queue"),
  });

  const [activeLead, setActiveLead] = useState<QueueLead | null>(null);
  const [callStarted, setCallStarted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [dialInfo, setDialInfo] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dialMutation = useMutation({
    mutationFn: (contactId: number) =>
      apiFetch<{ mode: string; message?: string }>("/api/calls/dial", {
        method: "POST",
        body: JSON.stringify({ contactId }),
      }),
    onSuccess: (data) => {
      setDialInfo(data.mode === "simulated" ? data.message ?? "Simulated call" : "Live call dialed");
    },
  });

  const saveCallMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/calls", { method: "POST", body: JSON.stringify(payload) }),
  });

  function startCallWith(lead: QueueLead) {
    setActiveLead(lead);
    setCallStarted(true);
    setCallEnded(false);
    setDuration(0);
    setOutcome(null);
    setTemperature(null);
    setNotes("");
    setDialInfo(null);
    dialMutation.mutate(lead.id);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }

  function endCall() {
    setCallEnded(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  function closeDialog() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setActiveLead(null);
    setCallStarted(false);
  }

  async function saveAndNext() {
    if (!activeLead || !outcome) return;
    await saveCallMutation.mutateAsync({
      contactId: activeLead.id,
      outcome,
      leadTemperature: temperature,
      notes,
      durationSeconds: duration,
    });
    queryClient.invalidateQueries({ queryKey: ["prospecting-queue"] });
    queryClient.invalidateQueries({ queryKey: ["prospecting-stats"] });
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });

    const remaining = (queue ?? []).filter((l) => l.id !== activeLead.id);
    if (remaining.length > 0) {
      toast.success(`Saved. Calling ${remaining[0].firstName} next...`);
      startCallWith(remaining[0]);
    } else {
      toast.success("Saved. Queue complete for now!");
      closeDialog();
    }
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

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
            onClick={() => queue && queue[0] && startCallWith(queue[0])}
          >
            Start Calling
          </Button>
        </div>
      </div>

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
            <Button className="w-full bg-primary text-primary-foreground" onClick={() => startCallWith(lead)}>
              📞 Call
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!activeLead} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-md">
          {activeLead && (
            <div>
              <div className="mb-4 text-center">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Calling
                </div>
                <div className="text-lg font-bold">
                  {activeLead.firstName} {activeLead.lastName}
                </div>
                <div className="text-sm text-muted-foreground">{activeLead.phone}</div>
                <div className="text-sm text-muted-foreground">{activeLead.companyName}</div>
                <div className="mt-3 text-2xl font-mono">{fmtDuration(duration)}</div>
                {dialInfo && (
                  <div className="mt-2 text-xs text-amber-400">{dialInfo}</div>
                )}
                {!callEnded && (
                  <Button variant="destructive" className="mt-4" onClick={endCall}>
                    🔴 End Call
                  </Button>
                )}
              </div>

              <div className="border-t pt-4">
                <div className="mb-2 text-sm font-semibold">AFTER CALL</div>
                <div className="mb-3 text-xs text-muted-foreground">What happened?</div>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o}
                      onClick={() => setOutcome(o)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-xs",
                        outcome === o
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-accent"
                      )}
                    >
                      {o}
                    </button>
                  ))}
                </div>

                <div className="mb-2 text-xs text-muted-foreground">Lead Temperature</div>
                <div className="mb-4 flex gap-2">
                  {TEMPERATURES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTemperature(t)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-xs",
                        temperature === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-accent"
                      )}
                    >
                      {t === "Hot" ? "🔥 Hot" : t}
                    </button>
                  ))}
                </div>

                <div className="mb-4 space-y-1.5">
                  <div className="text-xs text-muted-foreground">Notes</div>
                  <Textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Wants us to send pricing..."
                  />
                </div>

                <Button
                  className="w-full bg-primary text-primary-foreground"
                  disabled={!outcome || saveCallMutation.isPending}
                  onClick={saveAndNext}
                >
                  {saveCallMutation.isPending ? "Saving..." : "SAVE & NEXT LEAD"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
