"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type SentEmail = {
  id: number;
  contactId: number;
  name: string;
  email: string | null;
  companyName: string | null;
  mailboxEmail: string;
  sequenceName: string | null;
  subject: string;
  status: string;
  error: string | null;
  sentAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-secondary text-muted-foreground",
  failed: "bg-red-950 text-red-400",
  bounced: "bg-red-950 text-red-400",
};

const TABS = ["All", "sent", "failed", "bounced"];

export default function SentEmailsPage() {
  const [tab, setTab] = useState("All");

  const { data: emails, isLoading } = useQuery({
    queryKey: ["sent-emails", tab],
    queryFn: () => apiFetch<SentEmail[]>(`/api/sent-emails${tab === "All" ? "" : `?status=${tab}`}`),
    refetchInterval: 30000,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Sent Emails</h1>
        <p className="text-sm text-muted-foreground">
          Every contact ever emailed through your mailboxes — these leads are automatically excluded from future
          auto-picked campaigns so no one gets contacted twice.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs capitalize",
              tab === t ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-secondary/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Lead</th>
                <th className="p-3">Company</th>
                <th className="p-3">Sent From</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Status</th>
                <th className="p-3">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
              {!isLoading && (emails?.length ?? 0) === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No emails sent yet.</td></tr>
              )}
              {emails?.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3 font-medium">
                    {e.name}
                    <div className="text-xs text-muted-foreground">{e.email}</div>
                  </td>
                  <td className="p-3 text-muted-foreground">{e.companyName || "—"}</td>
                  <td className="p-3 text-muted-foreground">{e.mailboxEmail}</td>
                  <td className="p-3 text-muted-foreground">{e.sequenceName || "—"}</td>
                  <td className="p-3">{e.subject}</td>
                  <td className="p-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_COLORS[e.status] ?? STATUS_COLORS.sent)}>
                      {e.status}
                    </span>
                    {e.error && <div className="mt-1 max-w-[200px] truncate text-[11px] text-red-400" title={e.error}>{e.error}</div>}
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(e.sentAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
