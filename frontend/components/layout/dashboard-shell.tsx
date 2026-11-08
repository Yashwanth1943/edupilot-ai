"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  ChevronDown,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { navigationItems } from "@/services/mock-data";
import type { IconName } from "@/types/dashboard";
import { apiClient } from "@/services/api-client";
import { dataMode } from "@/services/data-mode";

const icons: Record<IconName, typeof LayoutDashboard> = {
  "layout-dashboard": LayoutDashboard,
  users: Users,
  "book-open": BookOpen,
  "chart-no-axes-combined": ChartNoAxesCombined,
  "file-spreadsheet": FileSpreadsheet,
  sparkles: Sparkles,
  settings: Settings,
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ name?: string; role?: string }>();
  const [authLoading, setAuthLoading] = useState(dataMode === "api");
  const [setupError, setSetupError] = useState("");
  const [setupRetry, setSetupRetry] = useState(0);
  useEffect(() => { if (dataMode !== "api") return; apiClient.setup.status().then((status) => { if (!status.initialized) { router.push("/setup"); return; } return apiClient.auth.me().then((value) => setUser(value as { name?: string; role?: string })).catch(() => { router.push(`/login?returnTo=${encodeURIComponent(pathname)}`); }); }).catch((caught) => { setSetupError(caught instanceof Error ? caught.message : "Unable to check EduPilot setup status."); }).finally(() => setAuthLoading(false)); }, [pathname, router, setupRetry]);
  const closeMobile = () => setMobileOpen(false);
  if (setupError) return <div className="grid min-h-screen place-items-center bg-[#f7f9fc] p-6"><div className="max-w-md rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-sm"><h1 className="text-lg font-bold text-slate-900">EduPilot setup is unavailable</h1><p className="mt-2 text-sm text-slate-500">{setupError}</p><button type="button" onClick={() => { setAuthLoading(true); setSetupError(""); setSetupRetry((value) => value + 1); }} className="mt-5 rounded-xl bg-[#5b5ce2] px-4 py-2.5 text-xs font-semibold text-white">Retry setup check</button></div></div>;

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-[#f7f9fc] text-sm text-slate-500">Checking your EduPilot session…</div>;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#172033]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#e8ecf3] bg-white px-5 py-6 transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-10 flex items-center justify-between px-2">
          <Link href="/" onClick={closeMobile} className="flex items-center gap-3" aria-label="EduPilot AI home">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#5b5ce2] to-[#7c3aed] text-white shadow-lg shadow-indigo-200"><Sparkles size={20} /></span>
            <span><span className="block text-base font-bold tracking-tight">EduPilot</span><span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7c3aed]">AI platform</span></span>
          </Link>
          <button type="button" className="rounded-lg p-2 text-slate-400 lg:hidden" onClick={closeMobile} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
          {navigationItems.filter((item) => !item.adminOnly || user?.role === "Admin").map((item) => {
            const Icon = icons[item.icon];
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} onClick={closeMobile} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-indigo-50 text-[#5556d8]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><Icon size={18} strokeWidth={active ? 2.4 : 2} /><span>{item.label}</span>{active && <span className="ml-auto size-1.5 rounded-full bg-[#5b5ce2]" />}</Link>;
          })}
        </nav>
        <div className="rounded-2xl bg-[#101936] p-4 text-white shadow-xl shadow-slate-200">
          <div className="mb-3 flex items-center gap-2 text-[#a5b4fc]"><Sparkles size={16} /><span className="text-xs font-semibold">AI assistant</span></div>
          <p className="mb-3 text-xs leading-5 text-slate-300">Your next learning insight is ready to review.</p>
          <Link href="/ai-insights" onClick={closeMobile} className="text-xs font-semibold text-white underline decoration-indigo-400 underline-offset-4">View insights</Link>
        </div>
      </aside>
      {mobileOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={closeMobile} />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e8ecf3] bg-[#f7f9fc]/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3"><button type="button" className="rounded-xl border border-[#e8ecf3] bg-white p-2.5 text-slate-600 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div><p className="text-xs font-medium text-slate-400">Tuesday, September 24, 2024</p><h1 className="text-lg font-bold tracking-tight text-slate-900">Good morning, Alex <span aria-hidden="true">👋</span></h1></div></div>
          <div className="flex items-center gap-3"><button type="button" className="relative rounded-xl border border-[#e8ecf3] bg-white p-2.5 text-slate-500" aria-label="Notifications"><Bell size={18} /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-violet-500" /></button><div className="hidden h-8 w-px bg-[#e8ecf3] sm:block" /><button type="button" onClick={() => { if (dataMode === "api") void apiClient.auth.logout().finally(() => router.push("/login")); }} className="flex items-center gap-2 rounded-xl bg-white p-1.5 pr-2 text-left"><span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">{(user?.name ?? "Alex Smith").split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span className="hidden text-xs font-semibold text-slate-700 sm:block">{user?.name ?? "Alex Smith"}</span><ChevronDown size={15} className="hidden text-slate-400 sm:block" /></button></div>
        </header>
        <main className="mx-auto max-w-[1500px] p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
