"use client";
/* The loader intentionally closes over the active search value. */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Eye, Loader2, Plus, Search, UserCheck, UserX } from "lucide-react";
import DashboardShell from "@/components/layout/dashboard-shell";
import StudentForm from "@/components/students/student-form";
import ExportModal from "@/components/exports/export-modal";
import {
  apiCreateStudent,
  apiGetStudent,
  apiListStudents,
  apiListSubjects,
  apiUpdateStudent
} from "@/services/api-resources";
import type { Student, Subject } from "@/types/dashboard";
import type { StudentInput } from "@/services/students";

export default function ApiStudentManagement() {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [query, setQuery] = useState("");
  const [formStudent, setFormStudent] = useState<Student | "new">();
  const [exportOpen, setExportOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () =>
    Promise.all([
      apiListStudents(query ? `q=${encodeURIComponent(query)}` : ""),
      apiListSubjects()
    ])
      .then(([studentResult, subjectResult]) => {
        setStudents(studentResult.items);
        setSubjects(subjectResult.items);
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Unable to load students.")
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, [query]);

  const handleAdd = () => {
    setFormError("");
    setFormStudent("new");
  };

  const handleEdit = async (student: Student) => {
    setLoadingEditId(student.id);
    setFormError("");
    try {
      const full = await apiGetStudent(student.id);
      setFormStudent(full);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load complete student record for editing."
      );
    } finally {
      setLoadingEditId(null);
    }
  };

  const save = async (input: StudentInput) => {
    setIsSaving(true);
    setFormError("");
    try {
      if (formStudent === "new") {
        await apiCreateStudent(input);
      } else if (formStudent) {
        await apiUpdateStudent(formStudent.id, input);
      }
      setFormStudent(undefined);
      setLoading(true);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Unable to save student.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (student: Student) => {
    const nextStatus = student.status === "Active" ? "Inactive" : "Active";
    const actionLabel = nextStatus === "Active" ? "reactivate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${student.fullName}?`)) return;

    setStatusUpdatingId(student.id);
    try {
      const full = await apiGetStudent(student.id);
      await apiUpdateStudent(student.id, {
        studentId: full.studentId,
        fullName: full.fullName,
        email: full.email,
        phone: full.phone,
        department: full.department,
        enrollmentDate: full.enrollmentDate,
        status: nextStatus,
        subjectIds: full.subjectIds
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Unable to ${actionLabel} student.`
      );
    } finally {
      setStatusUpdatingId(null);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5b5ce2]">
              People management
            </p>
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Students</h2>
            <p className="mt-2 text-sm text-slate-500">
              Live student records from the EduPilot API and MongoDB Atlas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
              aria-label="Export students to Excel"
            >
              <Download size={15} className="text-emerald-600" /> Export to Excel
            </button>
            <button
              onClick={handleAdd}
              className="flex w-fit items-center gap-2 rounded-xl bg-[#5b5ce2] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-100 hover:bg-[#4c4dcc] transition"
            >
              <Plus size={16} /> Add student
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e8ecf3] bg-white p-4 shadow-sm">
          <label className="relative block max-w-md">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="form-input pl-9"
              placeholder="Search by name, student ID, email, or mobile…"
            />
          </label>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
          >
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              className="text-rose-500 hover:text-rose-800 font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        <section className="overflow-x-auto rounded-2xl border border-[#e8ecf3] bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-sm text-slate-400">
              <Loader2 size={18} className="mr-2 animate-spin text-[#5b5ce2]" />
              Loading students…
            </div>
          ) : students.length === 0 ? (
            <p className="p-12 text-center text-sm text-slate-400">No students found.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3">Student</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Mobile Number</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => {
                  const isLoadingEdit = loadingEditId === student.id;
                  const isUpdatingStatus = statusUpdatingId === student.id;
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4">
                        <Link
                          href={`/students/${student.id}`}
                          className="text-xs font-semibold text-slate-800 hover:text-[#5b5ce2] transition"
                        >
                          {student.fullName}
                        </Link>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {student.studentId}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {student.email || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {student.phone || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {student.department ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            student.status === "Active"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {student.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/students/${student.id}`}
                            title="View student profile"
                            className="inline-flex rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition"
                          >
                            <Eye size={16} />
                          </Link>
                          <button
                            type="button"
                            disabled={isLoadingEdit}
                            onClick={() => void handleEdit(student)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition"
                          >
                            {isLoadingEdit ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                <span>Loading…</span>
                              </>
                            ) : (
                              "Edit"
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isUpdatingStatus}
                            onClick={() => void toggleStatus(student)}
                            title={
                              student.status === "Active"
                                ? "Deactivate student"
                                : "Reactivate student"
                            }
                            className={`inline-flex rounded-lg p-2 transition ${
                              student.status === "Active"
                                ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            }`}
                          >
                            {isUpdatingStatus ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : student.status === "Active" ? (
                              <UserX size={15} />
                            ) : (
                              <UserCheck size={15} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {formStudent && (
        <StudentForm
          student={formStudent === "new" ? undefined : formStudent}
          subjects={subjects}
          onClose={() => {
            setFormStudent(undefined);
            setFormError("");
          }}
          onSave={(input) => void save(input)}
          error={formError}
          isSaving={isSaving}
        />
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        currentQuery={query}
        subjects={subjects}
        defaultScope={query ? "filtered" : "all"}
        contextTitle="Students Directory"
      />
    </DashboardShell>
  );
}
