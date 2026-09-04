import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  LayoutDashboard,
  MessageCircleQuestion,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useRole, type Role } from "@/lib/role-context";
import { getSystemHealth } from "@/lib/policy-pilot.functions";

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ask", label: "Ask HR", icon: MessageCircleQuestion },
  { to: "/documents", label: "Policy Documents", icon: ClipboardList },
  { to: "/admin", label: "Admin / Upload", icon: Upload, adminOnly: true },
  { to: "/status", label: "System Status", icon: ShieldCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { role, setRole } = useRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const health = useQuery({
    queryKey: ["system-health", "topbar"],
    queryFn: () => getSystemHealth(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
              <span className="font-semibold">PolicyPilot</span>
              <span className="text-xs text-muted-foreground">HR Policy Assistant</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={pathname === item.to} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            Grounded strictly in uploaded HR policies.
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1 text-sm font-medium text-muted-foreground">
            {NAV_ITEMS.find((i) => i.to === pathname)?.label ?? "PolicyPilot"}
          </div>

          <ApplicationStatusBadge
            status={health.isLoading ? "loading" : health.isError ? "error" : health.data?.database}
          />

          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="h-8 w-[130px]" aria-label="Current role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ApplicationStatusBadge({ status }: { status: "ok" | "error" | "loading" | undefined }) {
  if (status === "loading" || status === undefined) {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50" /> Checking…
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="gap-1.5 border-red-200 text-red-700 dark:text-red-400">
        🔴 System error
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-green-200 text-green-700 dark:text-green-400"
    >
      🟢 Operational
    </Badge>
  );
}
