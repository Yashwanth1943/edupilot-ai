import { ArrowUpRight } from "lucide-react";
import type { ActivityItem } from "@/types/dashboard";

const tones = { blue: "bg-blue-100 text-blue-600", violet: "bg-violet-100 text-violet-600", green: "bg-emerald-100 text-emerald-600", orange: "bg-orange-100 text-orange-600" };

export default function RecentActivity({ activities }: { activities: ActivityItem[] }) {
  return <section className="rounded-2xl border border-[#e8ecf3] bg-white p-5 shadow-sm shadow-slate-100/70"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Recent activity</h2><p className="mt-1 text-xs text-slate-400">The latest updates across your workspace</p></div><button type="button" className="flex items-center gap-1 text-xs font-semibold text-[#5b5ce2]">View all <ArrowUpRight size={14} /></button></div><div className="space-y-4">{activities.map((activity) => <div key={activity.title} className="flex gap-3"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${tones[activity.tone]}`}><span className="size-2 rounded-full bg-current" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-slate-700">{activity.title}</p><time className="shrink-0 text-[10px] text-slate-400">{activity.time}</time></div><p className="mt-1 text-xs leading-5 text-slate-400">{activity.description}</p></div></div>)}</div></section>;
}
