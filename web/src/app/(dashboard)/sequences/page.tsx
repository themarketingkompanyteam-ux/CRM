"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Sequence = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  stepCount: number;
  activeEnrollments: number;
  completedEnrollments: number;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-950 text-green-400",
  paused: "bg-amber-950 text-amber-400",
  draft: "bg-secondary text-muted-foreground",
};

export default function SequencesPage() {
  const { data: sequences, isLoading } = useQuery({
    queryKey: ["sequences"],
    queryFn: () => apiFetch<Sequence[]>("/api/sequences"),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Email Campaigns</h1>
          <p className="text-sm text-muted-foreground">Sent through your own connected mailboxes (Gmail, SMTP) — capacity splits automatically across whichever you assign to a campaign</p>
        </div>
        <Link href="/sequences/new">
          <Button className="bg-primary text-primary-foreground">+ New Campaign</Button>
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-secondary/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Campaign</th>
              <th className="p-3">Status</th>
              <th className="p-3">Steps</th>
              <th className="p-3">Active</th>
              <th className="p-3">Completed</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && (sequences?.length ?? 0) === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No campaigns yet.</td></tr>
            )}
            {sequences?.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-medium">
                  <Link href={`/sequences/${s.id}`} className="hover:underline">{s.name}</Link>
                </td>
                <td className="p-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_COLORS[s.status] ?? STATUS_COLORS.draft)}>{s.status}</span>
                </td>
                <td className="p-3">{s.stepCount}</td>
                <td className="p-3">{s.activeEnrollments}</td>
                <td className="p-3">{s.completedEnrollments}</td>
                <td className="p-3">
                  <Link href={`/sequences/${s.id}`} className="text-primary underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
