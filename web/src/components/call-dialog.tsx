"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type CallLead = {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  companyName: string | null;
};

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

/** Invalidated after every logged call so all pages stay in sync. */
const AFFECTED_QUERY_KEYS = [
  "prospecting-queue",
  "prospecting-stats",
  "contacts",
  "dashboard",
  "leads",
  "call-history",
];

export function CallDialog({
  lead,
  onClose,
  getNext,
}: {
  lead: CallLead | null;
  onClose: () => void;
  /** If provided, "Save" becomes "Save & Next Lead" and auto-advances using this. */
  getNext?: (currentId: number) => Promise<CallLead | null>;
}) {
  const queryClient = useQueryClient();
  const [activeLead, setActiveLead] = useState<CallLead | null>(lead);
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

  function reset(newLead: CallLead) {
    setActiveLead(newLead);
    setCallEnded(false);
    setDuration(0);
    setOutcome(null);
    setTemperature(null);
    setNotes("");
    setDialInfo(null);
    dialMutation.mutate(newLead.id);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }

  useEffect(() => {
    if (lead) {
      reset(lead);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setActiveLead(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  function endCall() {
    setCallEnded(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  function invalidateAll() {
    for (const key of AFFECTED_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  async function handleSave() {
    if (!activeLead || !outcome) return;
    try {
      await saveCallMutation.mutateAsync({
        contactId: activeLead.id,
        outcome,
        leadTemperature: temperature,
        notes,
        durationSeconds: duration,
      });
    } catch (err) {
      toast.error(`Failed to save call: ${err instanceof Error ? err.message : "Unknown error"}`);
      return;
    }

    invalidateAll();

    if (getNext) {
      const next = await getNext(activeLead.id);
      if (next) {
        toast.success(`Saved. Calling ${next.firstName} next...`);
        reset(next);
        return;
      }
      toast.success("Saved. Queue complete for now!");
    } else {
      toast.success("Call saved");
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    onClose();
  }

  return (
    <Dialog open={!!lead} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        {activeLead && (
          <div>
            <div className="mb-4 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Calling</div>
              <div className="text-lg font-bold">
                {activeLead.firstName} {activeLead.lastName}
              </div>
              <div className="text-sm text-muted-foreground">{activeLead.phone}</div>
              <div className="text-sm text-muted-foreground">{activeLead.companyName}</div>
              <div className="mt-3 text-2xl font-mono">{fmtDuration(duration)}</div>
              {dialInfo && <div className="mt-2 text-xs text-amber-400">{dialInfo}</div>}
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
                      outcome === o ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
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
                      temperature === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
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
                onClick={handleSave}
              >
                {saveCallMutation.isPending
                  ? "Saving..."
                  : getNext
                    ? "SAVE & NEXT LEAD"
                    : "SAVE CALL"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
