"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions/auth";

const items = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/companies", label: "Companies", icon: "🏢" },
  { href: "/prospecting", label: "Prospecting", icon: "📞" },
  { href: "/calls", label: "Call History", icon: "📋" },
  { href: "/leads", label: "Leads", icon: "🔥" },
  { href: "/enrichment", label: "Enrichment", icon: "🔌" },
  { href: "/pipeline", label: "Pipeline", icon: "💰" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function SidebarNav({ username }: { username: string }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-[220px] shrink-0 flex-col gap-1.5 border-r bg-card px-3.5 py-5">
      <div className="mb-5 flex items-center gap-2 px-2 text-lg font-bold">
        <span className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-primary font-extrabold text-primary-foreground">
          W
        </span>
        Workspace
      </div>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-foreground"
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
      <div className="mt-auto border-t pt-3.5 text-xs text-muted-foreground">
        <div className="mb-1.5 font-semibold text-foreground">
          {username}
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-muted-foreground hover:text-foreground"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
