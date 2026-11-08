"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import Modal from "@/components/ui/modal";
import { apiClient } from "@/services/api-client";
import type { Subject } from "@/types/dashboard";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultScope?: "all" | "filtered" | "student";
  studentId?: string;
  studentName?: string;
  currentQuery?: string;
  currentStatus?: string;
  currentSubjectId?: string;
  subjects?: Subject[];
  contextTitle?: string;
}

export default function ExportModal({
  isOpen,
  onClose,
  defaultScope = "all",
  studentId,
  studentName,
  currentQuery = "",
  currentStatus = "All",
  currentSubjectId = "",
  subjects = [],
  contextTitle
}: ExportModalProps) {
  const [scope, setScope] = useState<"all" | "filtered" | "student">(
    studentId ? "student" : currentQuery || (currentStatus && currentStatus !== "All") ? "filtered" : defaultScope
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(currentSubjectId);
  const [statusFilter, setStatusFilter] = useState(currentStatus || "All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [mode, setMode] = useState<"all" | "summary" | "history">("all");
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (scope === "student" && studentId) {
        params.set("studentId", studentId);
      } else if (scope === "filtered") {
        if (currentQuery.trim()) params.set("q", currentQuery.trim());
        if (statusFilter && statusFilter !== "All") params.set("status", statusFilter);
      } else if (scope === "all") {
        if (statusFilter && statusFilter !== "All") params.set("status", statusFilter);
      }

      if (selectedSubjectId) {
        params.set("subjectId", selectedSubjectId);
      }

      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (mode) params.set("mode", mode);

      const queryString = params.toString();

      if (scope === "student" && studentId) {
        await apiClient.exports.studentProgress(studentId, queryString);
      } else if (contextTitle?.toLowerCase().includes("progress")) {
        await apiClient.exports.progress(queryString);
      } else {
        await apiClient.exports.students(queryString);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download Excel export.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal
      title="Export to Excel (.xlsx)"
      description="Download professionally formatted student progress workbooks for reporting, offline analysis, and record-keeping."
      onClose={onClose}
    >
      <div className="space-y-5 text-xs text-slate-700">
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="text-rose-500 hover:text-rose-800 font-semibold"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Scope Selection */}
        <div>
          <label className="block font-semibold text-slate-800 mb-2">Export Scope</label>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                scope === "all"
                  ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <span className="font-semibold text-xs">All Students</span>
              <span className="mt-1 text-[11px] text-slate-500">Entire institution directory</span>
            </button>

            <button
              type="button"
              onClick={() => setScope("filtered")}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                scope === "filtered"
                  ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <span className="font-semibold text-xs">Currently Filtered</span>
              <span className="mt-1 text-[11px] text-slate-500">
                {currentQuery ? `Query: "${currentQuery}"` : "Active view filters"}
              </span>
            </button>

            {studentId ? (
              <button
                type="button"
                onClick={() => setScope("student")}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                  scope === "student"
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <span className="font-semibold text-xs truncate max-w-full">
                  {studentName || "Selected Student"}
                </span>
                <span className="mt-1 text-[11px] text-slate-500 truncate max-w-full">
                  ID: {studentId}
                </span>
              </button>
            ) : (
              <div className="flex flex-col items-start rounded-xl border border-dashed border-slate-200 p-3 text-left opacity-60">
                <span className="font-semibold text-xs">Single Student</span>
                <span className="mt-1 text-[11px] text-slate-400">Available on profile page</span>
              </div>
            )}
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Subject Filter */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
            >
              <option value="">All Subjects</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Student Status Filter */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Student Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
            >
              <option value="All">All Statuses (Active & Inactive)</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Start Date <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              End Date <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Worksheet Content Scope */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Worksheet Contents</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50 transition">
              <input
                type="radio"
                name="export-mode"
                checked={mode === "all"}
                onChange={() => setMode("all")}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs">
                <strong>Complete Workbook</strong>
                <span className="block text-[10px] text-slate-400">All 3 worksheets</span>
              </span>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50 transition">
              <input
                type="radio"
                name="export-mode"
                checked={mode === "summary"}
                onChange={() => setMode("summary")}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs">
                <strong>Latest Summary Only</strong>
                <span className="block text-[10px] text-slate-400">Wide format overview</span>
              </span>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50 transition">
              <input
                type="radio"
                name="export-mode"
                checked={mode === "history"}
                onChange={() => setMode("history")}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs">
                <strong>Progress History Only</strong>
                <span className="block text-[10px] text-slate-400">All recorded snapshots</span>
              </span>
            </label>
          </div>
        </div>

        {/* Workbook Preview Info Card */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-xs">
            <FileSpreadsheet size={15} className="text-emerald-600" />
            Workbook Specification
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            The downloaded <code>.xlsx</code> file includes bold headers, auto-filters, frozen title
            rows, and preserves explicit 0% vs blank cells according to EduPilot data integrity standards.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-200 hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {isDownloading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generating Excel…
              </>
            ) : (
              <>
                <Download size={15} />
                Download Excel (.xlsx)
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

