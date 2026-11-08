"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  ChevronDown,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  LogOut,
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

type UserProfile = {
  name?: string;
  email?: string;
  role?: string;
  institution?: string;
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<UserProfile>();
  const [authLoading, setAuthLoading] = useState(dataMode === "api");
  const [setupError, setSetupError] = useState("");
  const [setupRetry, setSetupRetry] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dataMode !== "api") return;
    apiClient.setup
      .status()
      .then((status) => {
        if (!status.initialized) {
          router.push("/setup");
          return;
        }
        return apiClient.auth
          .me()
          .then((value) => setUser(value as UserProfile))
          .catch(() => {
            router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
          });
      })
      .catch((caught) => {
        setSetupError(
          caught instanceof Error ? caught.message : "Unable to check EduPilot setup status."
        );
      })
      .finally(() => setAuthLoading(false));
  }, [pathname, router, setupRetry]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const closeMobile = () => setMobileOpen(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      if (dataMode === "api") {
        await apiClient.auth.logout();
      }
    } catch (caught) {
      console.error("Logout request failed:", caught);
    } finally {
      setUser(undefined);
      setDropdownOpen(false);
      setMobileOpen(false);
      router.push("/login");
      setLoggingOut(false);
    }
  };

  if (setupError) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f9fc] p-6">
        <div className="max-w-md rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">EduPilot setup is unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{setupError}</p>
          <button
            type="button"
            onClick={() => {
              setAuthLoading(true);
              setSetupError("");
              setSetupRetry((value) => value + 1);
            }}
            className="mt-5 rounded-xl bg-[#5b5ce2] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-100 hover:bg-[#4c4dcc] transition"
          >
            Retry setup check
          </button>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f9fc] text-sm text-slate-500">
        <div className="flex items-center gap-2.5">
          <Loader2 size={18} className="animate-spin text-[#5b5ce2]" />
          <span>Checking your EduPilot session…</span>
        </div>
      </div>
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = user?.name ? user.name.split(" ")[0] : "Alex";

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#172033]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#e8ecf3] bg-white px-5 py-6 transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-10 flex items-center justify-between px-2">
          <Link
            href="/"
            onClick={closeMobile}
            className="flex items-center gap-3"
            aria-label="EduPilot AI home"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#5b5ce2] to-[#7c3aed] text-white shadow-lg shadow-indigo-200">
              <Sparkles size={20} />
            </span>
            <span>
              <span className="block text-base font-bold tracking-tight">EduPilot</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7c3aed]">
                AI platform
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 lg:hidden"
            onClick={closeMobile}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Workspace
          </p>
          {navigationItems
            .filter((item) => !item.adminOnly || user?.role === "Admin")
            .map((item) => {
              const Icon = icons[item.icon];
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-indigo-50 text-[#5556d8] font-semibold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.4 : 2} />
                  <span>{item.label}</span>
                  {active && <span className="ml-auto size-1.5 rounded-full bg-[#5b5ce2]" />}
                </Link>
              );
            })}
        </nav>

        <div className="rounded-2xl bg-[#101936] p-4 text-white shadow-xl shadow-slate-200">
          <div className="mb-3 flex items-center gap-2 text-[#a5b4fc]">
            <Sparkles size={16} />
            <span className="text-xs font-semibold">AI assistant</span>
          </div>
          <p className="mb-3 text-xs leading-5 text-slate-300">
            Your next learning insight is ready to review.
          </p>
          <Link
            href="/ai-insights"
            onClick={closeMobile}
            className="text-xs font-semibold text-white underline decoration-indigo-400 underline-offset-4"
          >
            View insights
          </Link>
        </div>

        {/* Mobile Navigation Drawer Profile & Logout */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-sm">
              {(user?.name ?? "Mentor")
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">
                {user?.name ?? "Alex Smith"}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                {user?.institution ?? user?.email ?? user?.role}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100/70 disabled:opacity-50 transition"
          >
            {loggingOut ? (
              <Loader2 size={14} className="animate-spin text-rose-500" />
            ) : (
              <LogOut size={14} className="text-rose-500" />
            )}
            <span>{loggingOut ? "Signing out…" : "Log out"}</span>
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={closeMobile}
        />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e8ecf3] bg-[#f7f9fc]/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-[#e8ecf3] bg-white p-2.5 text-slate-600 hover:bg-slate-50 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div>
              <p className="text-xs font-medium text-slate-400">{dateStr}</p>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Good {timeOfDay}, {firstName} <span aria-hidden="true">👋</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative rounded-xl border border-[#e8ecf3] bg-white p-2.5 text-slate-500 hover:bg-slate-50 transition"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-violet-500" />
            </button>
            <div className="hidden h-8 w-px bg-[#e8ecf3] sm:block" />

            {/* Desktop User Profile Trigger and Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2.5 rounded-xl border border-[#e8ecf3] bg-white p-1.5 pr-3 text-left shadow-sm transition hover:border-slate-300"
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                aria-label="User account menu"
              >
                <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-sm">
                  {(user?.name ?? "Mentor")
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold leading-tight text-slate-800">
                    {user?.name ?? "Alex Smith"}
                  </p>
                  <p className="text-[10px] font-medium text-slate-400">
                    {user?.role ?? "Mentor"}
                  </p>
                </div>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 ${
                    dropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {dropdownOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-[#e8ecf3] bg-white p-2 shadow-xl shadow-slate-200/60 z-50 animate-in fade-in slide-in-from-top-2"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="text-xs font-bold text-slate-900">
                      {user?.name ?? "EduPilot User"}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {user?.email ?? "mentor@institution.edu"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {user?.role ?? "Mentor"}
                      </span>
                      {user?.institution && (
                        <span className="truncate rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {user.institution}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="py-1">
                    {user?.role === "Admin" && (
                      <Link
                        href="/settings"
                        onClick={() => setDropdownOpen(false)}
                        role="menuitem"
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                      >
                        <Settings size={15} className="text-slate-400" />
                        <span>Workspace settings</span>
                      </Link>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      disabled={loggingOut}
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition"
                    >
                      {loggingOut ? (
                        <Loader2 size={15} className="animate-spin text-rose-500" />
                      ) : (
                        <LogOut size={15} className="text-rose-500" />
                      )}
                      <span>{loggingOut ? "Signing out…" : "Log out"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
