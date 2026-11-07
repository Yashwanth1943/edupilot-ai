"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressPoint } from "@/types/dashboard";

export default function ProgressTrendChart({ data }: { data: ProgressPoint[] }) {
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#eef1f6" strokeDasharray="4 4" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={10} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value) => `${value}%`} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e8ecf3", boxShadow: "0 8px 25px rgba(15, 23, 42, .08)", fontSize: 12 }} formatter={(value) => [`${value}%`, "Progress"]} /><Line type="monotone" dataKey="progress" stroke="#5b5ce2" strokeWidth={3} dot={{ r: 3, fill: "#5b5ce2", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div>;
}
