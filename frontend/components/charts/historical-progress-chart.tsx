"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ProgressChartPoint { date: string; progress: number; }

export default function HistoricalProgressChart({ data }: { data: ProgressChartPoint[] }) {
  if (data.length === 0) return <div className="grid h-64 place-items-center rounded-xl bg-slate-50 text-xs text-slate-400">No recorded progress in this range.</div>;
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="#eef1f6" strokeDasharray="4 4" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} dy={10} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value) => `${value}%`} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e8ecf3", boxShadow: "0 8px 25px rgba(15, 23, 42, .08)", fontSize: 12 }} formatter={(value) => [`${value}%`, "Progress"]} labelFormatter={(label) => `Effective ${label}`} /><Line type="monotone" dataKey="progress" stroke="#5b5ce2" strokeWidth={3} dot={{ r: 4, fill: "#5b5ce2", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div>;
}
