import { ArrowDownRight, ArrowUpRight, BookOpen, ChartNoAxesCombined, Sparkles, Users } from "lucide-react";
import type { Metric } from "@/types/dashboard";

const iconMap = { users: Users, "book-open": BookOpen, "chart-no-axes-combined": ChartNoAxesCombined, sparkles: Sparkles };
const accents = { blue: "bg-blue-50 text-blue-600", violet: "bg-violet-50 text-violet-600", cyan: "bg-cyan-50 text-cyan-600", orange: "bg-orange-50 text-orange-600" };

export default function StatCard({ metric }: { metric: Metric }) {
  const Icon = iconMap[metric.icon as keyof typeof iconMap];
  const TrendIcon = metric.trend === "up" ? ArrowUpRight : ArrowDownRight;
  return <article className="rounded-2xl border border-[#e8ecf3] bg-white p-5 shadow-sm shadow-slate-100/70"><div className="flex items-start justify-between"><span className={`grid size-10 place-items-center rounded-xl ${accents[metric.accent]}`}><Icon size={19} /></span><span className={`flex items-center gap-0.5 text-xs font-semibold ${metric.trend === "up" ? "text-emerald-500" : "text-rose-500"}`}><TrendIcon size={14} />{metric.change}</span></div><p className="mt-5 text-xs font-medium text-slate-400">{metric.label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{metric.value}</p></article>;
}
