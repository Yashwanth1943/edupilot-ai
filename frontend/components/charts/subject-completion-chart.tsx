"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SubjectCompletion } from "@/types/dashboard";

export default function SubjectCompletionChart({ data }: { data: SubjectCompletion[] }) {
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap="28%"><CartesianGrid horizontal={false} stroke="#eef1f6" /><XAxis type="number" domain={[0, 100]} hide /><YAxis type="category" dataKey="subject" axisLine={false} tickLine={false} width={94} tick={{ fill: "#64748b", fontSize: 11 }} /><Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 12, border: "1px solid #e8ecf3", fontSize: 12 }} formatter={(value) => [`${value}%`, "Completion"]} /><Bar dataKey="completion" radius={[0, 8, 8, 0]} fill="#5b5ce2" /></BarChart></ResponsiveContainer></div>;
}
