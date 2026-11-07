import DashboardShell from "@/components/layout/dashboard-shell";

export default function FeaturePage({ title, description }: { title: string; description: string }) {
  return <DashboardShell><div className="rounded-2xl border border-dashed border-[#cfd7e6] bg-white p-8 text-center shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5b5ce2]">EduPilot workspace</p><h2 className="mt-3 text-2xl font-bold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p><div className="mx-auto mt-8 max-w-md rounded-xl bg-slate-50 p-5 text-left"><p className="text-xs font-semibold text-slate-700">Coming in the next product slice</p><p className="mt-1 text-xs leading-5 text-slate-400">This route is connected and ready for its typed data workflow. Backend integration is intentionally out of scope for Phase 1.</p></div></div></DashboardShell>;
}
