"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CallRow = {
  id: number;
  contactId: number;
  name: string;
  companyName: string | null;
  outcome: string | null;
  leadTemperature: string | null;
  notes: string | null;
  durationSeconds: number;
  createdAt: string;
};

type HistoryResponse = {
  date: string;
  calls: CallRow[];
  total: number;
  byOutcome: Record<string, number>;
};

const FILTERS = ["All", "Voicemail", "Interested", "Booked Call", "Call Back Later", "Not Interested"];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const TEMP_COLORS: Record<string, string> = {
  Hot: "text-red-400",
  Warm: "text-amber-400",
  Cold: "text-muted-foreground",
};

export default function CallHistoryPage() {
  const [dateOffset, setDateOffset] = useState(0);
  const [filter, setFilter] = useState("All");

  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    return toDateStr(d);
  }, [dateOffset]);

  const { data, isLoading } = useQuery({
    queryKey: ["call-history", date],
    queryFn: () => apiFetch<HistoryResponse>(`/api/calls/history?date=${date}`),
  });

  const filteredCalls = data?.calls.filter((c) => filter === "All" || c.outcome === filter) ?? [];

  const dateLabel =
    dateOffset === 0
      ? "TODAY"
      : new Date(date + "T00:00:00").toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Call History</h1>
        <p className="text-sm text-muted-foreground">Every call logged, by day</p>
      </div>

      <div className="mb-5 flex items-center justify-center gap-4">
        <Button variant="outline" size="sm" onClick={() => setDateOffset((o) => o - 1)}>
          ← Previous Day
        </Button>
        <div className="min-w-[140px] text-center text-sm font-semibold">
          {dateLabel}
          {dateOffset !== 0 && (
            <button
              className="ml-2 text-xs text-primary underline"
              onClick={() => setDateOffset(0)}
            >
              Jump to today
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={dateOffset >= 0}
          onClick={() => setDateOffset((o) => Math.min(0, o + 1))}
        >
          Next Day →
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              filter === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mb-4 text-center text-sm text-muted-foreground">
        {isLoading ? "Loading..." : `${filteredCalls.length} call${filteredCalls.length === 1 ? "" : "s"}`}
      </div>

      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-3">
        {!isLoading && filteredCalls.length === 0 && (
          <div className="text-center text-sm text-muted-foreground">No calls logged for this day.</div>
        )}
        {filteredCalls.map((call) => (
          <div key={call.id} className="rounded-xl border bg-card p-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="font-semibold">{call.name}</div>
              <div className="text-xs text-muted-foreground">{fmtTime(call.createdAt)}</div>
            </div>
            <div className="mb-2 text-sm text-muted-foreground">{call.companyName || "—"}</div>
            {call.leadTemperature && (
              <div className={cn("mb-1 text-sm font-semibold", TEMP_COLORS[call.leadTemperature])}>
                {call.leadTemperature === "Hot" ? "🔥 Hot" : call.leadTemperature === "Warm" ? "🟠 Warm" : call.leadTemperature}
              </div>
            )}
            <div className="mb-2 text-sm">{call.outcome}</div>
            {call.notes && <div className="mb-2 text-sm italic text-muted-foreground">&quot;{call.notes}&quot;</div>}
            <div className="text-xs text-muted-foreground">Duration: {fmtDuration(call.durationSeconds)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
