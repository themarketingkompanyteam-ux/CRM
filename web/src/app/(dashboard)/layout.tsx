import { auth } from "@/auth";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen w-full">
      <SidebarNav username={session?.user?.name ?? ""} />
      <main className="flex-1 overflow-x-hidden p-8">{children}</main>
    </div>
  );
}
