"use client";
/* The loader is reused by mutation refreshes and closes over the profile id. */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Download,
  Edit3,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  UserRound
} from "lucide-react";
import DashboardShell from "@/components/layout/dashboard-shell";
import HistoricalProgressChart from "@/components/charts/historical-progress-chart";
import ProgressRecordForm from "@/components/progress/progress-record-form";
import StudentForm from "@/components/students/student-form";
import ExportModal from "@/components/exports/export-modal";
import {
  apiCreateProgress,
  apiGetStudent,
  apiListProgress,
  apiListSubjects,
  apiUpdateStudent
} from "@/services/api-resources";
import type { ProgressRecord, Student, Subject } from "@/types/dashboard";
import type { ProgressInput } from "@/services/progress";
import type { StudentInput } from "@/services/students";

export default function ApiStudentProfile({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<Student>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<ProgressRecord[]>([]);
  const [error, setError] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const load = () =>
    Promise.all([
      apiGetStudent(studentId),
      apiListSubjects(),
      apiListProgress(`studentId=${studentId}`)
    ])
      .then(([nextStudent, subjectResult, progressResult]) => {
        setStudent(nextStudent);
        setSubjects(subjectResult.items);
        setRecords(progressResult.items);
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Unable to load the student profile.")
      );

  useEffect(() => {
    void load();
  }, [studentId]);

  if (!student) {
    return (
      <DashboardShell>
        <div className="rounded-2xl border border-dashed border-[#cfd7e6] bg-white p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {error || "Loading student profile…"}
          </p>
          <Link
            href="/students"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#5b5ce2] px-4 py-2 text-xs font-semibold text-white"
          >
            <ArrowLeft size={14} /> Back to students
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const enrolledSubjects = subjects.filter((subject) => student.subjectIds.includes(subject.id));

  // Find latest progress for each subject
  const subjectLatestProgress: Record<string, number> = {};
  records.forEach((record) => {
    if (
      subjectLatestProgress[record.subjectId] === undefined ||
      record.effectiveDate >= (records.find((r) => r.id === record.id)?.effectiveDate ?? "")
    ) {
      subjectLatestProgress[record.subjectId] = record.progressPercent;
    }
  });

  const overallProgress =
    enrolledSubjects.length > 0
      ? Math.round(
          enrolledSubjects.reduce(
            (acc, sub) => acc + (subjectLatestProgress[sub.id] ?? 0),
            0
          ) / enrolledSubjects.length
        )
      : 0;

  const handleSaveStudent = async (input: StudentInput) => {
    setIsSavingEdit(true);
    setEditError("");
    try {
      await apiUpdateStudent(student.id, input);
      setEditOpen(false);
      await load();
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : "Unable to save student updates.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const chartData = [...records]
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    .map((record) => ({
      date: record.effectiveDate,
      progress: record.progressPercent
    }));

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/students"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#5b5ce2] transition"
          >
            <ArrowLeft size={15} /> Back to students
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
              aria-label="Export student progress to Excel"
            >
              <Download size={15} className="text-emerald-600" /> Export to Excel
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <Edit3 size={15} className="text-[#5b5ce2]" /> Edit student
            </button>
            <button
              type="button"
              onClick={() => setRecordOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5b5ce2] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-100 hover:bg-[#4c4dcc] transition"
            >
              <Plus size={15} /> Record progress
            </button>
          </div>
        </div>

        {/* Hero Banner */}
        <section className="flex flex-col justify-between gap-5 rounded-2xl bg-[#101936] p-6 text-white shadow-xl shadow-slate-200 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 text-xl font-bold">
              {student.fullName
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold">{student.fullName}</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                    student.status === "Active"
                      ? "bg-emerald-400/20 text-emerald-300"
                      : "bg-slate-500/30 text-slate-300"
                  }`}
                >
                  {student.status}
                </span>
              </div>
              <p className="mt-1 font-mono text-sm text-slate-300">
                {student.studentId} · {student.department || "No department assigned"}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 sm:text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Avg. Progress
            </p>
            <p className="mt-1 text-2xl font-bold text-indigo-200">{overallProgress}%</p>
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
            {error}
          </p>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-5">
            {/* Personal Information */}
            <section className="rounded-2xl border border-[#e8ecf3] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <UserRound size={17} className="text-[#5b5ce2]" />
                <h3 className="text-sm font-bold text-slate-900">Personal information</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <Mail size={16} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Email</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-700">{student.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone size={16} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Phone</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-700">
                      {student.phone || "Not provided"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarDays size={16} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      Enrollment date
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-700">
                      {student.enrollmentDate
                        ? new Date(student.enrollmentDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <BookOpen size={16} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Department</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-700">
                      {student.department || "General"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Historical Progress Chart */}
            <section className="rounded-2xl border border-[#e8ecf3] bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">Historical progress</h3>
              <p className="mt-0.5 text-xs text-slate-400">Preserved append-only learning snapshots</p>
              {records.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No progress records recorded for this student yet.
                </p>
              ) : (
                <>
                  <div className="mt-4">
                    <HistoricalProgressChart data={chartData} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {records.slice(0, 6).map((record) => (
                      <div
                        key={record.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                      >
                        <p className="font-semibold text-slate-700">
                          {subjects.find((subject) => subject.id === record.subjectId)?.name ??
                            "Subject"}
                        </p>
                        <p className="mt-1 text-slate-500">
                          {record.effectiveDate} ·{" "}
                          <span className="font-bold text-slate-800">
                            {record.progressPercent}%
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>

          <div className="space-y-5">
            {/* Enrolled Subjects & Progress */}
            <section className="rounded-2xl border border-[#e8ecf3] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Enrolled subjects</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {enrolledSubjects.length} subject{enrolledSubjects.length === 1 ? "" : "s"}{" "}
                    assigned
                  </p>
                </div>
                <ShieldCheck size={18} className="text-indigo-400" />
              </div>

              {enrolledSubjects.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-400">
                  No subjects assigned. Click &quot;Edit student&quot; to assign subjects.
                </p>
              ) : (
                <div className="space-y-3">
                  {enrolledSubjects.map((subject) => {
                    const progress = subjectLatestProgress[subject.id] ?? 0;
                    return (
                      <div
                        key={subject.id}
                        className="rounded-xl border border-slate-100 p-3.5 hover:bg-slate-50/50 transition"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-800">{subject.name}</p>
                          <span className="text-xs font-bold text-indigo-600">{progress}%</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {subject.department} · {subject.totalModules} modules
                        </p>
                        <div className="mt-2.5 h-2 w-full rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-[#5b5ce2] to-violet-500 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {editOpen && (
        <StudentForm
          student={student}
          subjects={subjects}
          onClose={() => {
            setEditOpen(false);
            setEditError("");
          }}
          onSave={(input) => void handleSaveStudent(input)}
          error={editError}
          isSaving={isSavingEdit}
        />
      )}

      {recordOpen && (
        <ProgressRecordForm
          students={[student]}
          subjects={subjects}
          initialStudentId={student.id}
          onClose={() => setRecordOpen(false)}
          onSubjectsAssigned={async (sId, subIds) => {
            setStudent((curr) => curr ? { ...curr, subjectIds: subIds } : curr);
            await load();
          }}
          onSave={async (input: ProgressInput) => {
            try {
              await apiCreateProgress(input);
              setRecordOpen(false);
              await load();
            } catch (caught) {
              setError(
                caught instanceof Error ? caught.message : "Unable to record progress."
              );
            }
          }}
        />
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        defaultScope="student"
        studentId={student.studentId || studentId}
        studentName={student.fullName}
        subjects={subjects}
        contextTitle={`${student.fullName} Progress`}
      />
    </DashboardShell>
  );
}
