"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { apiFetch, Contact, Company } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Contact>();
const EMPTY: Contact[] = [];

const columns = helper.columns([
  helper.accessor((row) => `${row.firstName} ${row.lastName ?? ""}`.trim(), {
    id: "name",
    header: "Name",
  }),
  helper.accessor("phone", { header: "Phone" }),
  helper.accessor("email", { header: "Email" }),
  helper.accessor("companyName", { header: "Company" }),
  helper.accessor("location", { header: "Location" }),
  helper.accessor("status", { header: "Status" }),
]);

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);
  const limit = 50;

  useEffect(() => setPage(1), [debouncedSearch]);

  const { data, isFetching } = useQuery({
    queryKey: ["contacts", page, debouncedSearch],
    queryFn: () =>
      apiFetch<{ data: Contact[]; total: number; totalPages: number }>(
        `/api/contacts?page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearch)}`
      ),
  });

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiFetch<Company[]>("/api/companies"),
  });

  const table = useTable({ features, columns, data: data?.data ?? EMPTY });

  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString()} total` : "Loading..."}
          </p>
        </div>
        <div className="flex gap-2">
          <ImportDialog />
          <AddContactDialog companies={companies ?? []} />
        </div>
      </div>

      <div className="mb-3.5">
        <Input
          placeholder="Search name, phone, email, company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[2fr_1.2fr_1.6fr_1.4fr_1.2fr_1fr_60px] border-b bg-secondary/40 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {table.getFlatHeaders().map((header) => (
            <div key={header.id}>
              <table.FlexRender header={header} />
            </div>
          ))}
          <div />
        </div>

        <div ref={scrollRef} className="h-[560px] overflow-auto">
          {isFetching && rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading contacts...
            </div>
          )}
          {!isFetching && rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No contacts found.
            </div>
          )}
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              const contact = row.original;
              return (
                <div
                  key={row.id}
                  data-index={item.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                  className="grid grid-cols-[2fr_1.2fr_1.6fr_1.4fr_1.2fr_1fr_60px] items-center border-b px-4 py-2.5 text-sm hover:bg-secondary/40"
                >
                  {row.getAllCells().map((cell) => (
                    <div key={cell.id} className="truncate pr-2">
                      {cell.column.id === "status" ? (
                        <Badge variant="secondary">{contact.status}</Badge>
                      ) : (
                        <table.FlexRender cell={cell} />
                      )}
                    </div>
                  ))}
                  <div className="text-right">
                    <button
                      onClick={() => deleteMutation.mutate(contact.id)}
                      className="text-muted-foreground hover:text-red-400"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-3.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddContactDialog({ companies }: { companies: Company[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/contacts", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      toast.success("Contact added");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button className="bg-primary text-primary-foreground">+ Add Contact</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            mutation.mutate({
              firstName: fd.get("firstName"),
              lastName: fd.get("lastName"),
              phone: fd.get("phone"),
              email: fd.get("email"),
              jobTitle: fd.get("jobTitle"),
              location: fd.get("location"),
              companyId: fd.get("companyId") ? Number(fd.get("companyId")) : null,
              notes: fd.get("notes"),
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input name="firstName" required />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input name="lastName" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input name="phone" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input name="email" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label>Company</Label>
            <Select name="companyId">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input name="location" />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ImportJob = {
  id: number;
  status: string;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  companiesCreatedCount: number;
  skippedCount: number;
};

function ImportDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: job } = useQuery({
    queryKey: ["import-job", jobId],
    queryFn: () => apiFetch<ImportJob>(`/api/contacts/import/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 800;
    },
  });

  useEffect(() => {
    if (job?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(
        `Import complete: ${job.createdCount} created, ${job.updatedCount} updated, ${job.companiesCreatedCount} companies created`
      );
    }
  }, [job?.status]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      return res.json() as Promise<{ jobId: number }>;
    },
    onSuccess: (data) => setJobId(data.jobId),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setJobId(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline">Import CSV</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
        </DialogHeader>
        {!jobId && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We recognize columns like Name/First Name/Last Name, Email, Phone,
              Company, Website, Job Title, and Location automatically.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
              }}
            />
            {uploadMutation.isPending && (
              <p className="text-sm text-muted-foreground">Uploading...</p>
            )}
          </div>
        )}
        {jobId && job && (
          <div className="space-y-3">
            <div className="h-2 w-full overflow-hidden rounded bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${job.totalRows ? Math.min(100, (job.processedRows / job.totalRows) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {job.status === "completed"
                ? "Import complete"
                : `Processing ${job.processedRows} / ${job.totalRows}...`}
            </p>
            {job.status === "completed" && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Created: {job.createdCount}</div>
                <div>Updated: {job.updatedCount}</div>
                <div>Companies created: {job.companiesCreatedCount}</div>
                <div>Skipped (no email/phone): {job.skippedCount}</div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
