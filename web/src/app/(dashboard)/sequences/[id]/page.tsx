"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Step = { id?: number; subject: string; body: string; delayDays: number };
type SequenceDetail = { sequence: { id: number; name: string; description: string | null; status: string }; steps: Step[] };
type Enrollment = {
  id: number;
  contactId: number;
  currentStep: number;
  status: string;
  nextSendAt: string;
  lastSentAt: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  sendEta: string | null; // ISO timestamp, "next_tick", or null
  blockedReason: string | null;
};

/** Live mm:ss (or h:mm:ss / d:hh:mm:ss for longer waits) countdown to a target Date. */
function Countdown({ target }: { target: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (totalSeconds <= 0) return <span>Sending now...</span>;
  if (days > 0) return <span>{days}d {pad(hours)}h {pad(minutes)}m</span>;
  if (hours > 0) return <span>{pad(hours)}:{pad(minutes)}:{pad(seconds)}</span>;
  return <span>{pad(minutes)}:{pad(seconds)}</span>;
}

/** Counts down to the next 2-minute mark — the queue checks for due sends every 2 minutes. */
function NextTickCountdown() {
  const [target] = useState(() => new Date(Math.ceil(Date.now() / (2 * 60 * 1000)) * (2 * 60 * 1000)));
  return <Countdown target={target} />;
}

function SendEtaCell({ enrollment }: { enrollment: Enrollment }) {
  if (enrollment.status !== "active") return <span className="text-muted-foreground">—</span>;
  if (enrollment.blockedReason === "no_capacity_today") {
    return <span className="text-amber-400">Mailbox at daily limit — resumes tomorrow</span>;
  }
  if (enrollment.sendEta === "next_tick") {
    return (
      <span className="text-primary">
        Sending in <NextTickCountdown />
      </span>
    );
  }
  if (enrollment.sendEta) {
    return <Countdown target={new Date(enrollment.sendEta)} />;
  }
  return <span className="text-muted-foreground">—</span>;
}

const ENROLLMENT_STATUS_COLORS: Record<string, string> = {
  active: "bg-secondary text-muted-foreground",
  completed: "bg-blue-950 text-blue-400",
  stopped_reply: "bg-green-950 text-green-400",
  stopped_bounce: "bg-red-950 text-red-400",
  stopped_unsubscribe: "bg-red-950 text-red-400",
  stopped_manual: "bg-amber-950 text-amber-400",
};

export default function SequenceDetailPage() {
  const params = useParams();
  const sequenceId = Number(params.id);
  const queryClient = useQueryClient();
  const [contactIdsInput, setContactIdsInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sequence", sequenceId],
    queryFn: () => apiFetch<SequenceDetail>(`/api/sequences/${sequenceId}`),
  });

  const { data: enrollments } = useQuery({
    queryKey: ["sequence-enrollments", sequenceId],
    queryFn: () => apiFetch<Enrollment[]>(`/api/sequences/${sequenceId}/enrollments`),
    refetchInterval: 10000,
  });

  const [steps, setSteps] = useState<Step[] | null>(null);
  const effectiveSteps = steps ?? data?.steps ?? [];

  const saveStepsMutation = useMutation({
    mutationFn: () => apiFetch(`/api/sequences/${sequenceId}`, { method: "PATCH", body: JSON.stringify({ steps: effectiveSteps }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence", sequenceId] });
      toast.success("Sequence saved");
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: (status: string) => apiFetch(`/api/sequences/${sequenceId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence", sequenceId] });
    },
  });

  const enrollMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ enrolled: number; skipped: number }>(`/api/sequences/${sequenceId}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          contactIds: contactIdsInput.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n) && n > 0),
        }),
      }),
    onSuccess: (r) => {
      toast.success(`Enrolled ${r.enrolled} contact(s)${r.skipped ? `, ${r.skipped} already enrolled` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["sequence-enrollments", sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["sequence", sequenceId] });
      setContactIdsInput("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{data.sequence.name}</h1>
          <p className="text-sm text-muted-foreground">Status: {data.sequence.status}</p>
        </div>
        <div className="flex gap-2">
          {data.sequence.status !== "active" ? (
            <Button className="bg-primary text-primary-foreground" onClick={() => setStatusMutation.mutate("active")}>Activate</Button>
          ) : (
            <Button variant="outline" onClick={() => setStatusMutation.mutate("paused")}>Pause</Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Steps</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {effectiveSteps.map((s, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>STEP {i + 1}{i > 0 ? ` — wait ${s.delayDays} day(s) after previous` : ""}</span>
                {effectiveSteps.length > 1 && (
                  <button className="text-red-400" onClick={() => setSteps(effectiveSteps.filter((_, idx) => idx !== i))}>
                    Delete Step
                  </button>
                )}
              </div>
              <Input
                value={s.subject}
                placeholder="Subject"
                onChange={(e) => setSteps(effectiveSteps.map((x, idx) => (idx === i ? { ...x, subject: e.target.value } : x)))}
              />
              <textarea
                className="min-h-[110px] w-full rounded-md border bg-background p-2 text-sm"
                value={s.body}
                placeholder="Hi {{firstName}}, ..."
                onChange={(e) => setSteps(effectiveSteps.map((x, idx) => (idx === i ? { ...x, body: e.target.value } : x)))}
              />
              {i > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span>Wait (days)</span>
                  <Input
                    type="number"
                    className="w-20"
                    value={s.delayDays}
                    onChange={(e) => setSteps(effectiveSteps.map((x, idx) => (idx === i ? { ...x, delayDays: Number(e.target.value) } : x)))}
                  />
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSteps([...effectiveSteps, { subject: "", body: "", delayDays: 3 }])}>
              + Add Step
            </Button>
            <Button className="bg-primary text-primary-foreground" disabled={saveStepsMutation.isPending} onClick={() => saveStepsMutation.mutate()}>
              Save Sequence
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Enroll Contacts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input
            value={contactIdsInput}
            onChange={(e) => setContactIdsInput(e.target.value)}
            placeholder="Contact IDs, comma-separated (e.g. 101, 102, 103)"
          />
          <Button variant="outline" disabled={!contactIdsInput || enrollMutation.isPending} onClick={() => enrollMutation.mutate()}>
            Enroll
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Enrollments ({enrollments?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Email</th>
                  <th className="pb-2 pr-3">Step</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Sends In</th>
                </tr>
              </thead>
              <tbody>
                {enrollments?.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="py-2 pr-3">{e.firstName} {e.lastName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{e.email}</td>
                    <td className="py-2 pr-3">{e.currentStep + 1} / {data.steps.length}</td>
                    <td className="py-2 pr-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", ENROLLMENT_STATUS_COLORS[e.status] ?? ENROLLMENT_STATUS_COLORS.active)}>
                        {e.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground"><SendEtaCell enrollment={e} /></td>
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
