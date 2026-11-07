import type {
  ActivityItem,
  Insight,
  Metric,
  NavItem,
  ProgressPoint,
  SubjectCompletion,
} from "@/types/dashboard";

export const navigationItems: NavItem[] = [
  { label: "Overview", href: "/", icon: "layout-dashboard" },
  { label: "Students", href: "/students", icon: "users" },
  { label: "Subjects", href: "/subjects", icon: "book-open" },
  { label: "Learning Progress", href: "/learning-progress", icon: "chart-no-axes-combined" },
  { label: "Excel Imports", href: "/excel-imports", icon: "file-spreadsheet" },
  { label: "AI Insights", href: "/ai-insights", icon: "sparkles" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

export const metrics: Metric[] = [
  { label: "Total Students", value: "2,846", change: "+12.5%", trend: "up", icon: "users", accent: "blue" },
  { label: "Active Subjects", value: "24", change: "+4.8%", trend: "up", icon: "book-open", accent: "violet" },
  { label: "Average Learning Progress", value: "78.4%", change: "+8.2%", trend: "up", icon: "chart-no-axes-combined", accent: "cyan" },
  { label: "Students Requiring Attention", value: "18", change: "-6.4%", trend: "down", icon: "sparkles", accent: "orange" },
];

export const progressTrend: ProgressPoint[] = [
  { month: "Jan", progress: 52 },
  { month: "Feb", progress: 57 },
  { month: "Mar", progress: 61 },
  { month: "Apr", progress: 60 },
  { month: "May", progress: 68 },
  { month: "Jun", progress: 72 },
  { month: "Jul", progress: 78 },
  { month: "Aug", progress: 81 },
  { month: "Sep", progress: 84 },
];

export const subjectCompletion: SubjectCompletion[] = [
  { subject: "Mathematics", completion: 86, color: "#5b5ce2" },
  { subject: "Science", completion: 78, color: "#38bdf8" },
  { subject: "English", completion: 72, color: "#8b5cf6" },
  { subject: "History", completion: 64, color: "#f59e0b" },
  { subject: "Computer Science", completion: 58, color: "#14b8a6" },
];

export const recentActivity: ActivityItem[] = [
  { title: "New students imported", description: "32 student profiles added from Grade 10A", time: "12 min ago", tone: "blue" },
  { title: "Progress milestone reached", description: "Class 8B crossed the 80% completion mark", time: "1 hr ago", tone: "green" },
  { title: "Assessment results updated", description: "Mathematics mid-term results are ready", time: "3 hrs ago", tone: "violet" },
  { title: "Attention needed", description: "5 learners have been inactive for 7 days", time: "Yesterday", tone: "orange" },
];

export const insights: Insight[] = [
  { title: "Math engagement is accelerating", description: "Grade 10 students improved their weekly practice consistency by 18%. Consider introducing the next challenge set early.", tag: "Momentum", priority: "High" },
  { title: "A small group needs support", description: "18 students have shown a drop in activity over the last two weeks. Three subjects are common across the group.", tag: "Intervention", priority: "Medium" },
];
