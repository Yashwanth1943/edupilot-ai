"use client";

import { useEffect, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { BookOpen, Check, Loader2, Plus } from "lucide-react";
import Modal from "@/components/ui/modal";
import type { Student, Subject } from "@/types/dashboard";
import type { ProgressInput } from "@/services/progress";
import { assignSubjects, getStudentById } from "@/services/students";
import { apiAssignSubject, apiGetStudentSubjects } from "@/services/api-resources";

export default function ProgressRecordForm({
  students,
  subjects,
  initialStudentId,
  onClose,
  onSave,
  onSubjectsAssigned
}: {
  students: Student[];
  subjects: Subject[];
  initialStudentId?: string;
  onClose: () => void;
  onSave: (input: ProgressInput) => void;
  onSubjectsAssigned?: (studentId: string, subjectIds: string[]) => void;
}) {
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const student = students.find((item) => item.id === studentId);

  // Local assigned subject IDs, synced from student and dynamic fetch
  const [assignedSubjectIds, setAssignedSubjectIds] = useState<string[]>(
    student?.subjectIds ?? []
  );
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Quick assignment UI state
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [selectedToAssign, setSelectedToAssign] = useState<string[]>([]);
  const [isAssigning, startAssigning] = useTransition();
  const [assignSuccess, setAssignSuccess] = useState("");
  const [assignError, setAssignError] = useState("");

  const [form, setForm] = useState({
    subjectId: "",
    progressPercent: "",
    effectiveDate: new Date().toISOString().slice(0, 10),
    updatedBy: "Alex Smith",
    mentorNotes: ""
  });
  const [error, setError] = useState("");

  // Fetch live active assignments whenever studentId changes
  useEffect(() => {
    if (!studentId) return;

    let cancelled = false;

    void apiGetStudentSubjects(studentId)
      .then((ids) => {
        if (!cancelled && ids.length > 0) {
          setAssignedSubjectIds(ids);
          setForm((curr) => ({
            ...curr,
            subjectId: curr.subjectId && ids.includes(curr.subjectId) ? curr.subjectId : ids[0] ?? ""
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          const mockStudent = getStudentById(studentId);
          if (mockStudent && mockStudent.subjectIds.length > 0) {
            setAssignedSubjectIds(mockStudent.subjectIds);
            setForm((curr) => ({
              ...curr,
              subjectId: curr.subjectId && mockStudent.subjectIds.includes(curr.subjectId) ? curr.subjectId : mockStudent.subjectIds[0] ?? ""
            }));
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSubjects(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const assignedSubjects = subjects.filter((subject) =>
    assignedSubjectIds.includes(subject.id)
  );

  const availableToAssign = subjects.filter(
    (subject) => !assignedSubjectIds.includes(subject.id)
  );

  const handleQuickAssign = () => {
    if (!studentId || selectedToAssign.length === 0) return;
    setAssignError("");
    setAssignSuccess("");

    startAssigning(async () => {
      try {
        for (const subId of selectedToAssign) {
          try {
            await apiAssignSubject(studentId, subId);
          } catch {
            assignSubjects(studentId, [subId]);
          }
        }
        const updated = Array.from(new Set([...assignedSubjectIds, ...selectedToAssign]));
        setAssignedSubjectIds(updated);
        onSubjectsAssigned?.(studentId, updated);

        // Auto select the first newly assigned subject
        if (!form.subjectId && selectedToAssign[0]) {
          setForm((curr) => ({ ...curr, subjectId: selectedToAssign[0] }));
        }

        const assignedNames = subjects
          .filter((s) => selectedToAssign.includes(s.id))
          .map((s) => s.name)
          .join(", ");
        setAssignSuccess(`Assigned ${assignedNames} successfully. You can now record progress.`);
        setSelectedToAssign([]);
        setShowAssignPanel(false);
      } catch (err) {
        setAssignError(err instanceof Error ? err.message : "Failed to assign subject.");
      }
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!studentId) {
      setError("Please select a student.");
      return;
    }
    if (!form.subjectId) {
      setError("Please select an assigned subject.");
      return;
    }
    try {
      onSave({
        studentId,
        subjectId: form.subjectId,
        progressPercent: Number(form.progressPercent),
        effectiveDate: form.effectiveDate,
        updatedBy: form.updatedBy,
        mentorNotes: form.mentorNotes || undefined
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save progress.");
    }
  };

  return (
    <Modal
      title="Record learning progress"
      description="Each update is appended to the progress history and never overwrites an earlier value."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Student Selector */}
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
            Student
            <select
              required
              value={studentId}
              onChange={(event) => {
                const nextId = event.target.value;
                setStudentId(nextId);
                const nextStudent = students.find((item) => item.id === nextId);
                setAssignedSubjectIds(nextStudent?.subjectIds ?? []);
                setForm((current) => ({ ...current, subjectId: "" }));
                setShowAssignPanel(false);
                setAssignSuccess("");
                setAssignError("");
                if (nextId) setLoadingSubjects(true);
              }}
              className="form-input"
            >
              <option value="">Select a student</option>
              {students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName} · {item.studentId}
                </option>
              ))}
            </select>
          </label>

          {/* Assigned Subject Selector */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">
                Assigned subject {loadingSubjects && <span className="font-normal text-slate-400">(loading…)</span>}
              </label>
              {studentId && !showAssignPanel && availableToAssign.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAssignPanel(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5b5ce2] hover:underline"
                >
                  <Plus size={13} /> Assign subjects
                </button>
              )}
            </div>
            <select
              required
              disabled={!studentId || assignedSubjects.length === 0}
              value={form.subjectId}
              onChange={(event) =>
                setForm((current) => ({ ...current, subjectId: event.target.value }))
              }
              className="form-input mt-1"
            >
              <option value="">
                {!studentId
                  ? "Select student first"
                  : assignedSubjects.length === 0
                  ? "No assigned subjects available"
                  : "Select an assigned subject"}
              </option>
              {assignedSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          {/* Warning banner when no subjects assigned */}
          {studentId && !loadingSubjects && assignedSubjects.length === 0 && !showAssignPanel && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-800">
                    This student has no assigned subjects.
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    Assign at least one subject before recording learning progress.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAssignPanel(true)}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition"
                >
                  <BookOpen size={13} /> Assign Subjects
                </button>
              </div>
            </div>
          )}

          {/* Inline Quick Assign Panel */}
          {showAssignPanel && studentId && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 sm:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800">
                  Assign subjects to {student?.fullName || "student"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAssignPanel(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>

              {availableToAssign.length === 0 ? (
                <p className="text-xs text-slate-500">
                  All available institution subjects are already assigned to this student.
                </p>
              ) : (
                <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
                  {availableToAssign.map((sub) => {
                    const isChecked = selectedToAssign.includes(sub.id);
                    return (
                      <label
                        key={sub.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs transition ${
                          isChecked
                            ? "border-[#5b5ce2] bg-white font-medium text-slate-900 shadow-sm"
                            : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedToAssign((curr) => [...curr, sub.id]);
                            } else {
                              setSelectedToAssign((curr) => curr.filter((id) => id !== sub.id));
                            }
                          }}
                          className="size-3.5 rounded accent-[#5b5ce2]"
                        />
                        <span className="truncate">{sub.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {assignError && (
                <p className="text-[11px] font-medium text-rose-600">{assignError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isAssigning || selectedToAssign.length === 0}
                  onClick={handleQuickAssign}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b5ce2] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#4c4dcc] disabled:opacity-50 transition"
                >
                  {isAssigning ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Assigning…
                    </>
                  ) : (
                    <>
                      <Check size={13} /> Confirm & Assign ({selectedToAssign.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {assignSuccess && (
            <p className="rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-700 sm:col-span-2">
              ✓ {assignSuccess}
            </p>
          )}

          {/* Progress percentage */}
          <label className="text-xs font-semibold text-slate-600">
            Progress percentage
            <input
              required
              min="0"
              max="100"
              type="number"
              value={form.progressPercent}
              onChange={(event) =>
                setForm((current) => ({ ...current, progressPercent: event.target.value }))
              }
              className="form-input"
              placeholder="0–100"
            />
          </label>

          {/* Effective progress date */}
          <label className="text-xs font-semibold text-slate-600">
            Effective progress date
            <input
              required
              type="date"
              value={form.effectiveDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, effectiveDate: event.target.value }))
              }
              className="form-input"
            />
          </label>

          {/* Updated by */}
          <label className="text-xs font-semibold text-slate-600">
            Updated by
            <input
              required
              value={form.updatedBy}
              onChange={(event) =>
                setForm((current) => ({ ...current, updatedBy: event.target.value }))
              }
              className="form-input"
            />
          </label>

          {/* Mentor notes */}
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
            Mentor notes <span className="font-normal text-slate-400">(optional)</span>
            <textarea
              value={form.mentorNotes}
              onChange={(event) =>
                setForm((current) => ({ ...current, mentorNotes: event.target.value }))
              }
              className="form-input min-h-20 resize-y"
              placeholder="Add context for this update"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!studentId || !form.subjectId}
            className="rounded-xl bg-[#5b5ce2] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-100 hover:bg-[#4c4dcc] disabled:opacity-50 transition"
          >
            Record progress
          </button>
        </div>
      </form>
    </Modal>
  );
}
