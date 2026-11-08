"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import Modal from "@/components/ui/modal";
import type { Student, StudentStatus, Subject } from "@/types/dashboard";
import type { StudentInput } from "@/services/students";

const emptyForm: StudentInput = {
  studentId: "",
  fullName: "",
  email: "",
  phone: "",
  department: "",
  enrollmentDate: new Date().toISOString().slice(0, 10),
  status: "Active",
  subjectIds: []
};

export default function StudentForm({
  student,
  subjects,
  onClose,
  onSave,
  error,
  isSaving = false
}: {
  student?: Student;
  subjects: Subject[];
  onClose: () => void;
  onSave: (input: StudentInput) => void;
  error?: string;
  isSaving?: boolean;
}) {
  const [form, setForm] = useState<StudentInput>(
    student
      ? {
          studentId: student.studentId,
          fullName: student.fullName,
          email: student.email,
          phone: student.phone ?? "",
          department: student.department ?? "",
          enrollmentDate: student.enrollmentDate,
          status: student.status,
          subjectIds: student.subjectIds ?? []
        }
      : emptyForm
  );
  const [clientError, setClientError] = useState("");

  const update = <K extends keyof StudentInput>(key: K, value: StudentInput[K]) => {
    setClientError("");
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.studentId.trim()) {
      setClientError("Student ID is required.");
      return;
    }
    if (!form.fullName.trim() || form.fullName.trim().length < 2) {
      setClientError("Full name must be at least 2 characters.");
      return;
    }
    const cleanEmail = form.email?.trim() || "";
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setClientError("Please enter a valid email address, or leave it blank.");
      return;
    }
    if (!form.enrollmentDate) {
      setClientError("Enrollment date is required.");
      return;
    }
    onSave({
      ...form,
      studentId: form.studentId.trim(),
      fullName: form.fullName.trim(),
      email: cleanEmail ? cleanEmail.toLowerCase() : "",
      phone: form.phone?.trim() || "",
      department: form.department?.trim() || ""
    });
  };

  const displayedError = error || clientError;

  return (
    <Modal
      title={student ? "Edit student" : "Add student"}
      description={
        student
          ? "Update student information, status, and assigned subjects in EduPilot."
          : "Create a new student record and assign initial subjects."
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5">
        {displayedError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-500" />
            <span className="leading-relaxed">{displayedError}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Student ID
            <input
              required
              disabled={isSaving}
              value={form.studentId}
              onChange={(event) => update("studentId", event.target.value)}
              className="form-input"
              placeholder="e.g. N26V03A0001"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Full name
            <input
              required
              disabled={isSaving}
              value={form.fullName}
              onChange={(event) => update("fullName", event.target.value)}
              className="form-input"
              placeholder="Full name"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Email <span className="font-normal text-slate-400">(optional)</span>
            <input
              disabled={isSaving}
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              className="form-input"
              placeholder="student@example.com (optional)"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Mobile number <span className="font-normal text-slate-400">(optional)</span>
            <input
              disabled={isSaving}
              type="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              className="form-input"
              placeholder="+91 98765 43210 (optional)"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Department <span className="font-normal text-slate-400">(optional)</span>
            <input
              disabled={isSaving}
              value={form.department}
              onChange={(event) => update("department", event.target.value)}
              className="form-input"
              placeholder="Grade 10 · A"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Enrollment date
            <input
              required
              disabled={isSaving}
              type="date"
              value={form.enrollmentDate}
              onChange={(event) => update("enrollmentDate", event.target.value)}
              className="form-input"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Status
            <select
              disabled={isSaving}
              value={form.status}
              onChange={(event) => update("status", event.target.value as StudentStatus)}
              className="form-input"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-slate-600">
            Assigned subjects ({form.subjectIds.length} selected)
          </legend>
          {subjects.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-400">
              No subjects available yet. You can create subjects in the Subjects tab.
            </p>
          ) : (
            <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
              {subjects.map((subject) => {
                const checked = form.subjectIds.includes(subject.id);
                return (
                  <label
                    key={subject.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs transition ${
                      checked
                        ? "border-[#5b5ce2] bg-indigo-50/40 text-slate-900 font-medium"
                        : "border-slate-100 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={checked}
                      onChange={(event) =>
                        update(
                          "subjectIds",
                          event.target.checked
                            ? [...form.subjectIds, subject.id]
                            : form.subjectIds.filter((id) => id !== subject.id)
                        )
                      }
                      className="size-4 rounded accent-[#5b5ce2]"
                    />
                    <span className="truncate">{subject.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 rounded-xl bg-[#5b5ce2] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-100 hover:bg-[#4c4dcc] disabled:opacity-60 transition"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            {student
              ? isSaving
                ? "Saving changes…"
                : "Save changes"
              : isSaving
              ? "Adding student…"
              : "Add student"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
