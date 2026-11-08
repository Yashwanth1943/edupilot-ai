"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Info,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import DashboardShell from "@/components/layout/dashboard-shell";
import Modal from "@/components/ui/modal";
import {
  analyzeImportFile,
  apiConfirmImport,
  apiListImportHistory,
  apiPreviewImport,
  apiRevalidateImport,
  executeImport,
  isWideFormatHeaders,
  listImportHistory,
  suggestMapping,
  validateWorksheet
} from "@/services/imports";
import { apiListStudents, apiCreateStudent, apiListSubjects } from "@/services/api-resources";
import { listStudents, createStudent } from "@/services/students";
import { listSubjects } from "@/services/subjects";
import { dataMode } from "@/services/data-mode";
import type {
  ColumnMapping,
  CustomFieldMapping,
  ImportBatch,
  ImportStep,
  ImportValidationRow,
  ParsedWorkbook,
  Student,
  Subject
} from "@/types/dashboard";

const steps: { key: ImportStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "mapping", label: "Map columns" },
  { key: "validation", label: "Validate" },
  { key: "preview", label: "Preview & Edit" },
  { key: "complete", label: "Complete" }
];

const bytes = (size: number) =>
  size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export default function ExcelImportWizard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("upload");
  const [workbook, setWorkbook] = useState<ParsedWorkbook>();
  const [worksheetIndex, setWorksheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [rows, setRows] = useState<ImportValidationRow[]>([]);
  const [history, setHistory] = useState<ImportBatch[]>(() => listImportHistory());
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [apiBatchId, setApiBatchId] = useState("");
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>(() =>
    dataMode === "mock" ? listSubjects() : []
  );
  const [availableStudents, setAvailableStudents] = useState<Student[]>(() =>
    dataMode === "mock" ? listStudents() : []
  );

  const worksheet = workbook?.worksheets[worksheetIndex];
  const isWide = useMemo(() => isWideFormatHeaders(worksheet?.headers ?? []), [worksheet]);

  const [confirmSummary, setConfirmSummary] = useState<Record<string, unknown>>();

  const counts = useMemo(() => {
    const uniqueExisting = new Set<string>();
    const uniqueNew = new Set<string>();
    const uniqueAmbiguous = new Set<string>();
    const uniqueMissing = new Set<string>();
    const uniqueConflict = new Set<string>();

    for (const r of rows) {
      const sId = r.values.studentId?.trim().toLowerCase();
      const sName = r.values.studentName?.trim().toLowerCase();
      const key = sId ? `id:${sId}` : (sName ? `name:${sName}` : `row:${r.rowNumber}`);
      if (r.studentStatus === "Existing Student") uniqueExisting.add(key);
      else if (r.studentStatus === "New Student – Will Create") uniqueNew.add(key);
      else if (r.studentStatus === "Ambiguous Student") uniqueAmbiguous.add(key);
      else if (r.studentStatus === "Missing Identity") uniqueMissing.add(key);
      else if (r.studentStatus === "Identity Conflict") uniqueConflict.add(key);
    }

    const progressToImport = rows.filter((r) => r.progressStatus === "Will Import").length;
    const progressSkipped = rows.filter((r) => r.progressStatus === "No Update" || r.progressStatus === "Duplicate").length;
    const progressRejected = rows.filter((r) => r.classification === "Invalid" || r.progressStatus === "Invalid").length;
    const progressUnchanged = rows.filter((r) => r.progressStatus === "Unchanged").length;

    return {
      valid: rows.filter((r) => r.classification === "Valid").length,
      warning: rows.filter((r) => r.classification === "Warning").length,
      invalid: rows.filter((r) => r.classification === "Invalid").length,
      skipped: rows.filter((r) => r.classification === "Skipped" || r.action === "Skip").length,
      existingStudentsMatched: uniqueExisting.size,
      newStudentsToCreate: uniqueNew.size,
      ambiguousIdentities: uniqueAmbiguous.size,
      studentsMissingIdentifiers: uniqueMissing.size,
      identityConflicts: uniqueConflict.size,
      progressToImport,
      progressSkipped,
      progressRejected,
      progressUnchanged
    };
  }, [rows]);

  const stepIndex = steps.findIndex((item) => item.key === step);

  useEffect(() => {
    if (dataMode === "api") {
      void apiListImportHistory()
        .then(setHistory)
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load import history."));
      void apiListSubjects()
        .then((res) => setAvailableSubjects(res.items))
        .catch(() => setAvailableSubjects(listSubjects()));
      void apiListStudents()
        .then((res) => setAvailableStudents(res.items))
        .catch(() => setAvailableStudents(listStudents()));
    }
  }, []);

  const acceptFile = async (file?: File) => {
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension || !["csv", "xlsx", "xls"].includes(extension)) {
      setError("Unsupported file. Select a .csv, .xlsx, or .xls file.");
      return;
    }
    setError("");
    setNotice("");
    setUploading(true);
    setUploadProgress(25);
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      setUploadProgress(60);
      setSelectedFile(file);

      if (dataMode === "api") {
        const preview = await apiPreviewImport(file, {});
        const parsed: ParsedWorkbook = {
          fileName: file.name,
          fileSize: file.size,
          fileType: extension as ParsedWorkbook["fileType"],
          worksheets: preview.worksheets.map((sheet) => ({
            name: sheet.name,
            headers: sheet.headers,
            rowCount: sheet.rowCount,
            sampleRows: sheet.sampleRows ?? [],
            rows: sheet.sampleRows ?? []
          })),
          parserStatus: "ready"
        };
        setWorkbook(parsed);
        setApiBatchId(preview.batch.id);
        const initialMapping = parsed.worksheets[0] ? suggestMapping(parsed.worksheets[0].headers) : {};
        setMapping(initialMapping);
        setRows(preview.rows);
        setStep("mapping");
      } else {
        const parsed = await analyzeImportFile(file);
        setWorkbook(parsed);
        setMapping(parsed.worksheets[0] ? suggestMapping(parsed.worksheets[0].headers) : {});
        setRows([]);
        if (parsed.parserStatus === "unsupported") {
          setError(parsed.parserMessage ?? "This workbook type is not supported by the current parser adapter.");
        } else {
          setStep("mapping");
        }
      }
      setUploadProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be analyzed. Try exporting as CSV and upload again.");
    } finally {
      setUploading(false);
    }
  };

  const handleValidateFromMapping = (finalMapping: ColumnMapping) => {
    if (!worksheet) return;

    setMapping(finalMapping);
    setError("");
    setNotice("");

    if (dataMode === "api" && selectedFile) {
      void apiPreviewImport(selectedFile, finalMapping)
        .then((preview) => {
          setApiBatchId(preview.batch.id);
          setRows(preview.rows);
          setStep("validation");
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to validate this file."));
    } else {
      setRows(validateWorksheet(worksheet, finalMapping));
      setStep("validation");
    }
  };

  const handleUpdateRowValue = (rowNumber: number, field: string, val: string) => {
    setRows((current) =>
      current.map((r) => {
        if (r.rowNumber !== rowNumber) return r;
        const newValues = { ...r.values, [field]: val };
        const rawProgress = (newValues.progressPercent ?? "").replace("%", "").trim();
        const isBlank = rawProgress === "";
        let changeType = r.changeType;
        let diff = r.difference;
        let action = r.action;
        let classification = r.classification;
        let isDateDefaulted = r.isDateDefaulted;
        let issues = r.issues;

        if (field === "effectiveDate") {
          isDateDefaulted = false;
          issues = issues.filter((i) => i.code !== "DATE_DEFAULTED");
        }

        if (field === "progressPercent") {
          if (isBlank) {
            changeType = "No update";
            action = "Skip";
            classification = "Skipped";
          } else {
            const p = Number(rawProgress);
            if (Number.isFinite(p) && p >= 0 && p <= 100) {
              if (r.previousProgress !== null && r.previousProgress !== undefined) {
                diff = Number((p - r.previousProgress).toFixed(1));
                changeType = diff > 0 ? "Improving" : diff < 0 ? "Decreased" : "Unchanged";
              } else {
                changeType = "New";
              }
              action = "Insert";
              // Don't auto-clear invalid if student/subject/date might still be wrong
              if (classification === "Skipped") classification = "Valid";
            }
          }
        }

        return {
          ...r,
          values: newValues,
          changeType,
          difference: diff,
          action,
          classification,
          isDateDefaulted,
          issues
        };
      })
    );
  };

  const handleDeleteRow = (rowNumber: number) => {
    setRows((current) => current.filter((r) => r.rowNumber !== rowNumber));
    setNotice(`Row ${rowNumber} removed from preview.`);
  };

  const handleUpdateRowMultipleValues = (rowNumber: number, updates: Record<string, string>) => {
    setRows((current) =>
      current.map((r) => {
        if (r.rowNumber !== rowNumber) return r;
        const newValues = { ...r.values, ...updates };
        let issues = r.issues;
        if (updates.studentId) {
          issues = issues.filter((i) => i.code !== "UNKNOWN_STUDENT" && i.code !== "MISSING_STUDENT");
        }
        return {
          ...r,
          values: newValues,
          issues
        };
      })
    );
  };

  const handleStudentCreated = (newStudent: Student, rowNumber?: number) => {
    setAvailableStudents((prev) => [newStudent, ...prev.filter((s) => s.id !== newStudent.id)]);
    if (rowNumber !== undefined) {
      setRows((current) =>
        current.map((r) => {
          if (r.rowNumber !== rowNumber) return r;
          return {
            ...r,
            values: {
              ...r.values,
              studentId: newStudent.studentId,
              studentName: newStudent.fullName
            },
            issues: r.issues.filter((i) => i.code !== "UNKNOWN_STUDENT" && i.code !== "MISSING_STUDENT")
          };
        })
      );
      setTimeout(() => {
        void handleRevalidate();
      }, 50);
    }
    setNotice(`Student ${newStudent.fullName} (${newStudent.studentId}) created and mapped successfully.`);
  };

  const handleRevalidate = async () => {
    if (!apiBatchId || rows.length === 0) return;
    setRevalidating(true);
    setError("");
    setNotice("");
    try {
      if (dataMode === "api") {
        const result = await apiRevalidateImport(apiBatchId, rows);
        setRows(result.rows);
        const valid = result.rows.filter((r) => r.classification === "Valid").length;
        const invalid = result.rows.filter((r) => r.classification === "Invalid").length;
        const skipped = result.rows.filter((r) => r.classification === "Skipped" || r.action === "Skip").length;
        setNotice(`Revalidation complete: ${valid} valid, ${skipped} skipped (no update), ${invalid} invalid.`);
      } else {
        if (worksheet) {
          setRows(validateWorksheet(worksheet, mapping));
          setNotice("Revalidated locally.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revalidation failed.");
    } finally {
      setRevalidating(false);
    }
  };

  const reset = () => {
    setWorkbook(undefined);
    setRows([]);
    setMapping({});
    setSelectedFile(undefined);
    setApiBatchId("");
    setError("");
    setNotice("");
    setUploadProgress(0);
    setStep("upload");
    if (inputRef.current) inputRef.current.value = "";
  };

  const importRows = () => {
    if (!workbook) return;
    if (dataMode === "api" && apiBatchId) {
      void apiConfirmImport(apiBatchId, rows)
        .then((res) => {
          const batch = res.batch;
          setConfirmSummary(res.summary);
          setHistory((current) => [batch, ...current.filter((item) => item.id !== batch.id)]);
          setSelectedBatch(batch);
          setConfirming(false);
          setStep("complete");
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to confirm this import."));
    } else {
      const batch = executeImport(workbook.fileName, rows);
      setHistory(listImportHistory());
      setSelectedBatch(batch);
      setConfirming(false);
      setStep("complete");
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5b5ce2]">Data operations</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Excel imports</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Import and inspect learning updates with editable preview, automatic wide-column unpivoting, and partial-data preservation.
          </p>
        </div>

        <div className="rounded-2xl border border-[#e8ecf3] bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-8 flex items-center justify-between gap-2 overflow-x-auto">
            {steps.map((item, index) => (
              <div key={item.key} className="flex min-w-fit items-center gap-2">
                <span
                  className={`grid size-8 place-items-center rounded-full text-xs font-bold ${
                    index < stepIndex
                      ? "bg-emerald-100 text-emerald-600"
                      : index === stepIndex
                      ? "bg-[#5b5ce2] text-white"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {index < stepIndex ? <Check size={15} /> : index + 1}
                </span>
                <span className={`text-xs font-semibold ${index === stepIndex ? "text-slate-800" : "text-slate-400"}`}>
                  {item.label}
                </span>
                {index < steps.length - 1 && <span className="mx-2 hidden h-px w-8 bg-slate-200 sm:block" />}
              </div>
            ))}
          </div>

          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} className="ml-auto" aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}

          {notice && (
            <div role="status" className="mb-5 flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700">
              <Info size={16} className="mt-0.5 shrink-0" />
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")} className="ml-auto" aria-label="Dismiss notice">
                <X size={14} />
              </button>
            </div>
          )}

          {step === "upload" && (
            <UploadStep
              inputRef={inputRef}
              dragging={dragging}
              uploading={uploading}
              progress={uploadProgress}
              onDrop={(file) => {
                setDragging(false);
                void acceptFile(file);
              }}
              onDragEnter={() => setDragging(true)}
              onDragLeave={() => setDragging(false)}
              onSelect={(file) => void acceptFile(file)}
              onBrowse={() => inputRef.current?.click()}
            />
          )}

          {step === "mapping" && workbook && worksheet && (
            <MappingStep
              workbook={workbook}
              worksheet={worksheet}
              worksheetIndex={worksheetIndex}
              setWorksheetIndex={(index) => {
                setWorksheetIndex(index);
                setMapping(suggestMapping(workbook.worksheets[index].headers));
              }}
              mapping={mapping}
              setMapping={setMapping}
              availableSubjects={availableSubjects}
              isWide={isWide}
              onBack={reset}
              onContinue={handleValidateFromMapping}
            />
          )}

          {step === "validation" && workbook && (
            <ValidationStep
              rows={rows}
              counts={counts}
              onBack={() => setStep("mapping")}
              onContinue={() => setStep("preview")}
            />
          )}

          {step === "preview" && workbook && (
            <PreviewStep
              rows={rows}
              counts={counts}
              fileName={workbook.fileName}
              revalidating={revalidating}
              availableStudents={availableStudents}
              availableSubjects={availableSubjects}
              onUpdateRowValue={handleUpdateRowValue}
              onUpdateRowMultipleValues={handleUpdateRowMultipleValues}
              onDeleteRow={handleDeleteRow}
              onRevalidate={handleRevalidate}
              onStudentCreated={handleStudentCreated}
              onBack={() => setStep("validation")}
              onConfirm={() => setConfirming(true)}
            />
          )}

          {step === "complete" && selectedBatch && (
            <CompleteStep batch={selectedBatch} summary={confirmSummary} onReset={reset} />
          )}
        </div>

        <ImportHistory history={history} onSelect={setSelectedBatch} />
      </div>

      {confirming && (
        <ConfirmImportModal
          counts={counts}
          onClose={() => setConfirming(false)}
          onConfirm={importRows}
        />
      )}

      {selectedBatch && confirming === false && step !== "complete" && (
        <BatchModal batch={selectedBatch} onClose={() => setSelectedBatch(undefined)} />
      )}
    </DashboardShell>
  );
}

function UploadStep({
  inputRef,
  dragging,
  uploading,
  progress,
  onDrop,
  onDragEnter,
  onDragLeave,
  onSelect,
  onBrowse
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  dragging: boolean;
  uploading: boolean;
  progress: number;
  onDrop: (file?: File) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onSelect: (file?: File) => void;
  onBrowse: () => void;
}) {
  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          onDragEnter();
        }}
        onDragLeave={onDragLeave}
        onDrop={(event) => {
          event.preventDefault();
          onDrop(event.dataTransfer.files[0]);
        }}
        className={`rounded-2xl border-2 border-dashed p-12 text-center transition ${
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50/70"
        }`}
      >
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => onSelect(event.target.files?.[0])} />
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
          <UploadCloud size={25} />
        </span>
        <h3 className="mt-4 text-sm font-bold text-slate-800">Drop your spreadsheet here</h3>
        <p className="mt-2 text-xs text-slate-400">
          Supports CSV and multi-worksheet Excel (.xlsx, .xls) files. Both wide and tall formats are supported.
        </p>
        <button type="button" onClick={onBrowse} className="mt-5 rounded-xl bg-[#5b5ce2] px-4 py-2.5 text-xs font-semibold text-white">
          Choose file
        </button>
        <p className="mt-4 text-[10px] font-medium text-slate-400">Accepted formats: .csv, .xlsx, .xls</p>
      </div>
      {uploading && (
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-700">
            <span className="flex items-center gap-2">
              <LoaderCircle size={14} className="animate-spin" />
              Analyzing spreadsheet structure
            </span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-indigo-100">
            <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

interface ChecklistItem {
  id: string;
  key: string;
  label: string;
  type: "standard" | "wide-subject" | "custom";
  required: boolean;
  sourceColumn: string;
  subjectName?: string;
  included?: boolean;
  customDataType?: "string" | "number" | "date" | "percentage";
  storageDestination?: "unpersisted" | "student_metadata" | "progress_metadata";
  description?: string;
  ignored?: boolean;
}

function MappingStep({
  workbook,
  worksheet,
  worksheetIndex,
  setWorksheetIndex,
  mapping,
  setMapping,
  availableSubjects,
  isWide,
  onBack,
  onContinue
}: {
  workbook: ParsedWorkbook;
  worksheet: ParsedWorkbook["worksheets"][number];
  worksheetIndex: number;
  setWorksheetIndex: (index: number) => void;
  mapping: ColumnMapping;
  setMapping: React.Dispatch<React.SetStateAction<ColumnMapping>>;
  availableSubjects: Subject[];
  isWide: boolean;
  onBack: () => void;
  onContinue: (finalMapping: ColumnMapping) => void;
}) {
  const [localError, setLocalError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "mapped" | "wide" | "custom" | "ignored">("all");
  const [showAddModal, setShowAddModal] = useState(false);

  // Add mapping modal state
  const [addSourceCol, setAddSourceCol] = useState("");
  const [addCategory, setAddCategory] = useState<"custom" | "wide" | "standard">("custom");
  const [addCustomLabel, setAddCustomLabel] = useState("");
  const [addCustomDataType, setAddCustomDataType] = useState<"string" | "number" | "date" | "percentage">("string");
  const [addCustomStorage, setAddCustomStorage] = useState<"unpersisted" | "student_metadata" | "progress_metadata">("unpersisted");
  const [addWideSubject, setAddWideSubject] = useState("");
  const [addStandardField, setAddStandardField] = useState("");

  // Initialize checklist items
  const [items, setItems] = useState<ChecklistItem[]>(() => {
    // 1. Standard items
    const standard: ChecklistItem[] = isWide
      ? [
          {
            id: "std-studentId",
            key: "studentId",
            label: "Student ID",
            type: "standard",
            required: true,
            sourceColumn: mapping.studentId ?? "",
            description: "Learner identifier or roll number"
          },
          {
            id: "std-studentName",
            key: "studentName",
            label: "Student Name",
            type: "standard",
            required: false,
            sourceColumn: mapping.studentName ?? "",
            description: "Full name of the student (optional)"
          },
          {
            id: "std-effectiveDate",
            key: "effectiveDate",
            label: "Effective Date",
            type: "standard",
            required: false,
            sourceColumn: mapping.effectiveDate ?? "",
            description: "Date of recorded progress (YYYY-MM-DD) · If omitted or blank, defaults to today (Asia/Kolkata)"
          },
          {
            id: "std-mentorNotes",
            key: "mentorNotes",
            label: "Mentor Notes",
            type: "standard",
            required: false,
            sourceColumn: mapping.mentorNotes ?? "",
            description: "Qualitative observations or mentor feedback"
          }
        ]
      : [
          {
            id: "std-studentId",
            key: "studentId",
            label: "Student ID",
            type: "standard",
            required: true,
            sourceColumn: mapping.studentId ?? "",
            description: "Learner identifier or roll number"
          },
          {
            id: "std-studentName",
            key: "studentName",
            label: "Student Name",
            type: "standard",
            required: false,
            sourceColumn: mapping.studentName ?? "",
            description: "Full name of the student (optional)"
          },
          {
            id: "std-subject",
            key: "subject",
            label: "Subject",
            type: "standard",
            required: true,
            sourceColumn: mapping.subject ?? "",
            description: "Course or subject name/code for tall-format rows"
          },
          {
            id: "std-progressPercent",
            key: "progressPercent",
            label: "Progress Value (%)",
            type: "standard",
            required: true,
            sourceColumn: mapping.progressPercent ?? "",
            description: "Completion score or percentage (0 - 100%)"
          },
          {
            id: "std-effectiveDate",
            key: "effectiveDate",
            label: "Effective Date",
            type: "standard",
            required: false,
            sourceColumn: mapping.effectiveDate ?? "",
            description: "Date of recorded progress (YYYY-MM-DD) · If omitted or blank, defaults to today (Asia/Kolkata)"
          },
          {
            id: "std-mentorNotes",
            key: "mentorNotes",
            label: "Mentor Notes",
            type: "standard",
            required: false,
            sourceColumn: mapping.mentorNotes ?? "",
            description: "Qualitative observations or mentor feedback"
          }
        ];

    // 2. Wide format subject items
    const wideItems: ChecklistItem[] = [];
    if (isWide) {
      const standardCols = new Set(
        [
          mapping.studentId?.toLowerCase(),
          mapping.studentName?.toLowerCase(),
          mapping.effectiveDate?.toLowerCase(),
          mapping.mentorNotes?.toLowerCase()
        ].filter(Boolean)
      );

      const existingSubCols = (mapping.subjectColumns as Record<string, string>) || {};

      for (const h of worksheet.headers) {
        const clean = h.trim().toLowerCase();
        if (!clean || standardCols.has(clean)) continue;

        const match = availableSubjects.find(
          (s) => s.name.toLowerCase() === clean || s.id.toLowerCase() === clean
        );

        if (match || existingSubCols[h]) {
          const targetSub = existingSubCols[h] || match?.name || h;
          wideItems.push({
            id: `wide-${h}`,
            key: `wide-${h}`,
            label: `Subject: ${targetSub}`,
            type: "wide-subject",
            required: false,
            sourceColumn: h,
            subjectName: targetSub,
            included: true,
            description: "Wide-format progress column. Blank cell = No update."
          });
        }
      }
    }

    // 3. Custom fields if any
    const customItems: ChecklistItem[] = [];
    if (Array.isArray(mapping.customFields)) {
      for (const cf of mapping.customFields as CustomFieldMapping[]) {
        customItems.push({
          id: `custom-${cf.key}`,
          key: cf.key,
          label: `${cf.label} (Custom)`,
          type: "custom",
          required: false,
          sourceColumn: cf.sourceColumn,
          customDataType: cf.dataType,
          storageDestination: cf.storageDestination,
          description: `Custom field [${cf.dataType}]. Storage: ${cf.storageDestination}`
        });
      }
    }

    return [...standard, ...wideItems, ...customItems];
  });

  // Extract sample values from detected sheet rows
  const getSampleValues = (colName: string): string[] => {
    if (!colName) return [];
    const idx = worksheet.headers.indexOf(colName);
    if (idx === -1) return [];
    const sourceRows = (worksheet.sampleRows && worksheet.sampleRows.length > 0)
      ? worksheet.sampleRows
      : worksheet.rows;
    const samples: string[] = [];
    for (const r of sourceRows) {
      const val = r[idx]?.trim();
      if (val && !samples.includes(val)) {
        samples.push(val);
      }
      if (samples.length >= 3) break;
    }
    return samples;
  };

  // Track which columns are mapped to which items to flag duplicate conflicts
  const columnUsage = useMemo(() => {
    const usage: Record<string, string[]> = {};
    for (const it of items) {
      if (it.sourceColumn && !it.ignored && (it.type !== "wide-subject" || it.included)) {
        usage[it.sourceColumn] = usage[it.sourceColumn] || [];
        usage[it.sourceColumn].push(it.label);
      }
    }
    return usage;
  }, [items]);

  const getItemStatus = (item: ChecklistItem): "Mapped" | "Pending" | "Optional" | "Ignored" => {
    if (item.ignored || (item.type === "wide-subject" && !item.included)) {
      return "Ignored";
    }
    if (item.sourceColumn) {
      return "Mapped";
    }
    if (item.required) {
      return "Pending";
    }
    return "Optional";
  };

  const stats = useMemo(() => {
    let mapped = 0;
    let pending = 0;
    let optional = 0;
    let ignored = 0;
    let wide = 0;
    let custom = 0;

    for (const it of items) {
      const status = getItemStatus(it);
      if (status === "Mapped") mapped++;
      else if (status === "Pending") pending++;
      else if (status === "Optional") optional++;
      else if (status === "Ignored") ignored++;

      if (it.type === "wide-subject") wide++;
      if (it.type === "custom") custom++;
    }

    return { total: items.length, mapped, pending, optional, ignored, wide, custom };
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const status = getItemStatus(it);
      if (activeTab === "pending" && status !== "Pending") return false;
      if (activeTab === "mapped" && status !== "Mapped") return false;
      if (activeTab === "wide" && it.type !== "wide-subject") return false;
      if (activeTab === "custom" && it.type !== "custom") return false;
      if (activeTab === "ignored" && status !== "Ignored") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesLabel = it.label.toLowerCase().includes(q);
        const matchesCol = it.sourceColumn.toLowerCase().includes(q);
        const matchesDesc = (it.description ?? "").toLowerCase().includes(q);
        if (!matchesLabel && !matchesCol && !matchesDesc) return false;
      }
      return true;
    });
  }, [items, activeTab, searchQuery]);

  // Update a single item's source column
  const handleSetSourceCol = (id: string, col: string) => {
    setItems((current) =>
      current.map((it) => {
        if (it.id !== id) return it;
        if (col === "__ignore__") {
          return { ...it, sourceColumn: "", ignored: true };
        }
        return { ...it, sourceColumn: col, ignored: false };
      })
    );
  };

  // Toggle wide subject inclusion
  const handleToggleWideInclude = (id: string) => {
    setItems((current) =>
      current.map((it) => {
        if (it.id !== id) return it;
        return { ...it, included: !it.included };
      })
    );
  };

  // Change wide subject target subject
  const handleSetWideSubject = (id: string, subjectName: string) => {
    setItems((current) =>
      current.map((it) => {
        if (it.id !== id) return it;
        return { ...it, subjectName, label: `Subject: ${subjectName}` };
      })
    );
  };

  // Delete an item
  const handleDeleteItem = (id: string) => {
    setItems((current) => current.filter((it) => it.id !== id));
  };

  // Auto-suggest mappings using alias detector
  const handleAutoSuggest = () => {
    const suggested = suggestMapping(worksheet.headers);
    setItems((current) =>
      current.map((it) => {
        if (it.type === "standard") {
          const match = suggested[it.key as keyof ColumnMapping];
          if (match && typeof match === "string") {
            return { ...it, sourceColumn: match, ignored: false };
          }
        }
        return it;
      })
    );
  };

  // Clear all source columns
  const handleClearAll = () => {
    setItems((current) =>
      current.map((it) => ({
        ...it,
        sourceColumn: "",
        ignored: false
      }))
    );
  };

  // Save new custom/wide/standard mapping from modal
  const handleSaveNewMapping = () => {
    if (!addSourceCol) {
      setLocalError("Please select a source Excel column.");
      return;
    }

    if (addCategory === "custom") {
      const label = addCustomLabel.trim() || `Field_${Date.now().toString().slice(-4)}`;
      const key = label.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const newItem: ChecklistItem = {
        id: `custom-${Date.now()}`,
        key,
        label: `${label} (Custom)`,
        type: "custom",
        required: false,
        sourceColumn: addSourceCol,
        customDataType: addCustomDataType,
        storageDestination: addCustomStorage,
        description: `Custom attribute [${addCustomDataType}]. Destination: ${addCustomStorage}`
      };
      setItems((prev) => [...prev, newItem]);
    } else if (addCategory === "wide") {
      const targetSub = addWideSubject || addSourceCol;
      const newItem: ChecklistItem = {
        id: `wide-${addSourceCol}-${Date.now()}`,
        key: `wide-${addSourceCol}`,
        label: `Subject: ${targetSub}`,
        type: "wide-subject",
        required: false,
        sourceColumn: addSourceCol,
        subjectName: targetSub,
        included: true,
        description: "Wide-format progress column. Blank cell = No update."
      };
      setItems((prev) => [...prev, newItem]);
    } else if (addCategory === "standard") {
      if (!addStandardField) return;
      setItems((prev) =>
        prev.map((it) => (it.key === addStandardField ? { ...it, sourceColumn: addSourceCol, ignored: false } : it))
      );
    }

    // Reset modal state
    setShowAddModal(false);
    setAddSourceCol("");
    setAddCustomLabel("");
    setAddWideSubject("");
    setAddStandardField("");
  };

  // Validate and submit mapping to Step 3
  const handleValidateClick = () => {
    setLocalError("");

    // 1. Check duplicate conflicts
    const duplicateCols = Object.entries(columnUsage).filter(([, mappedLabels]) => mappedLabels.length > 1);
    if (duplicateCols.length > 0) {
      const [col, mappedLabels] = duplicateCols[0];
      setLocalError(
        `Conflicting mappings: Column "${col}" is mapped to multiple fields (${mappedLabels.join(
          ", "
        )}). Each Excel column should only be mapped to one field.`
      );
      return;
    }

    // 2. Check required student identifier
    const studentIdItem = items.find((it) => it.key === "studentId");
    const studentNameItem = items.find((it) => it.key === "studentName");
    if (!studentIdItem?.sourceColumn && !studentNameItem?.sourceColumn) {
      setLocalError("Student ID is mandatory. Please select the source Excel column for Student ID.");
      return;
    }

    // 3. If tall format: check subject and progress
    if (!isWide) {
      const subjectItem = items.find((it) => it.key === "subject");
      const progressItem = items.find((it) => it.key === "progressPercent");
      if (!subjectItem?.sourceColumn) {
        setLocalError("Subject is mandatory for tall-format imports. Please select the Subject column.");
        return;
      }
      if (!progressItem?.sourceColumn) {
        setLocalError(
          "Progress percentage is mandatory for tall-format imports. Please select the Progress percentage column."
        );
        return;
      }
    } else {
      // Wide format: ensure at least one subject column is included and mapped
      const activeWideItems = items.filter(
        (it) => it.type === "wide-subject" && it.included && it.sourceColumn && it.subjectName
      );
      if (activeWideItems.length === 0) {
        setLocalError("At least one subject progress column must be included and mapped for wide-format imports.");
        return;
      }
    }

    // Assemble final ColumnMapping
    const finalMapping: ColumnMapping = {};
    const subjectColumns: Record<string, string> = {};
    const customFields: CustomFieldMapping[] = [];

    for (const item of items) {
      if (item.ignored) continue;
      if (item.type === "standard") {
        if (item.sourceColumn) {
          finalMapping[item.key as keyof ColumnMapping] = item.sourceColumn;
        }
      } else if (item.type === "wide-subject") {
        if (item.included && item.sourceColumn && item.subjectName) {
          subjectColumns[item.sourceColumn] = item.subjectName;
        }
      } else if (item.type === "custom") {
        if (item.sourceColumn) {
          customFields.push({
            key: item.key,
            label: item.label.replace(" (Custom)", ""),
            sourceColumn: item.sourceColumn,
            dataType: item.customDataType || "string",
            storageDestination: item.storageDestination || "unpersisted"
          });
        }
      }
    }

    if (Object.keys(subjectColumns).length > 0) {
      finalMapping.subjectColumns = subjectColumns;
    }
    if (customFields.length > 0) {
      finalMapping.customFields = customFields;
    }

    setMapping(finalMapping);
    onContinue(finalMapping);
  };

  const detectedDataRowCount = worksheet.rowCount ?? worksheet.rows.length;

  return (
    <div>
      {/* Step Header & Format Overview */}
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Step 2: Map Spreadsheet Columns</h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                isWide
                  ? "border border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {isWide ? "Wide format (Multi-subject)" : "Tall format (One subject/row)"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {isWide
              ? "Wide format detected: Subject columns are dynamically mapped and unpivoted into individual student progress snapshots."
              : "Map each spreadsheet column to the corresponding EduPilot learning record field."}
          </p>
        </div>

        {workbook.worksheets.length > 1 && (
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Worksheet
            <select
              value={worksheetIndex}
              onChange={(event) => {
                const idx = Number(event.target.value);
                setWorksheetIndex(idx);
              }}
              className="form-input mt-1 normal-case tracking-normal"
            >
              {workbook.worksheets.map((item, index) => (
                <option key={item.name} value={index}>
                  {item.name} ({item.rowCount ?? item.rows.length} rows)
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Info Banner with Real Data Row Count */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-indigo-600" />
          <span className="font-semibold text-slate-800">{workbook.fileName}</span>
          <span>·</span>
          <span>{bytes(workbook.fileSize)}</span>
          <span>·</span>
          <span className="font-semibold text-indigo-700">{detectedDataRowCount} data rows</span>
          <span>·</span>
          <span className="font-semibold text-slate-700">{worksheet.headers.length} columns detected</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoSuggest}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Sparkles size={12} className="text-indigo-500" /> Auto-suggest
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus size={12} /> Add Mapping
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Wide Format Notice if Applicable */}
      {isWide && (
        <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5 text-xs text-indigo-900">
          <div className="flex items-start gap-2">
            <Info size={15} className="mt-0.5 text-indigo-600 shrink-0" />
            <div>
              <p className="font-semibold">Wide-format Spreadsheet Intelligence</p>
              <p className="mt-0.5 text-indigo-700">
                Subject columns are detected automatically. You can include/exclude individual subjects, re-associate
                them with institution courses, or add more subject columns below. Blank cells will remain <em>No update</em> (never converted to zero).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error / Conflict Alert */}
      {localError && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 text-rose-600 shrink-0" />
            <div className="font-medium">{localError}</div>
          </div>
        </div>
      )}

      {/* To-Do Checklist Workspace */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Workspace Controls: Search & Filter Tabs */}
        <div className="border-b border-slate-100 p-4 bg-slate-50/50">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  activeTab === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                All ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("pending")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${
                  activeTab === "pending"
                    ? "bg-amber-600 text-white"
                    : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50"
                }`}
              >
                Needs Action ({stats.pending})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mapped")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${
                  activeTab === "mapped"
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
                }`}
              >
                Mapped ({stats.mapped})
              </button>
              {stats.wide > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("wide")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === "wide"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
                  }`}
                >
                  Subjects ({stats.wide})
                </button>
              )}
              {stats.custom > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("custom")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === "custom"
                      ? "bg-purple-600 text-white"
                      : "bg-white text-purple-700 border border-purple-200 hover:bg-purple-50"
                  }`}
                >
                  Custom ({stats.custom})
                </button>
              )}
              {stats.ignored > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("ignored")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === "ignored"
                      ? "bg-slate-600 text-white"
                      : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Ignored ({stats.ignored})
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search fields or columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input py-1.5 pl-8 text-xs placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Checklist Rows */}
        <div className="divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No column mappings match the current filter.
            </div>
          ) : (
            filteredItems.map((item) => {
              const status = getItemStatus(item);
              const samples = getSampleValues(item.sourceColumn);
              const isConflicted = item.sourceColumn && (columnUsage[item.sourceColumn]?.length ?? 0) > 1;

              return (
                <div
                  key={item.id}
                  className={`p-4 transition hover:bg-slate-50/50 ${
                    status === "Ignored" ? "bg-slate-50/30 opacity-60" : ""
                  }`}
                >
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_1.8fr_auto] lg:items-center">
                    {/* Field Info & Badges */}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Checkbox indicator */}
                        <span
                          className={`flex size-5 items-center justify-center rounded-md text-[10px] font-bold ${
                            status === "Mapped"
                              ? "bg-emerald-100 text-emerald-700"
                              : status === "Pending"
                              ? "bg-amber-100 text-amber-700"
                              : status === "Ignored"
                              ? "bg-slate-100 text-slate-400"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {status === "Mapped" ? (
                            <Check size={12} />
                          ) : status === "Pending" ? (
                            "!"
                          ) : (
                            "—"
                          )}
                        </span>

                        <span className="text-xs font-bold text-slate-900">{item.label}</span>

                        {/* Status badge */}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            status === "Mapped"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : status === "Pending"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : status === "Ignored"
                              ? "bg-slate-100 text-slate-500 border border-slate-200"
                              : item.key === "effectiveDate" && !item.sourceColumn
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {item.key === "effectiveDate" && !item.sourceColumn ? "Default: Today" : status}
                        </span>

                        {/* Required / Optional badge */}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                            item.required
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-slate-50 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {item.required ? "Required" : "Optional"}
                        </span>

                        {/* Custom / Storage designation badge */}
                        {item.type === "custom" && (
                          <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold text-purple-700 border border-purple-200">
                            Custom · Preview Only
                          </span>
                        )}
                        {item.type === "wide-subject" && (
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700 border border-indigo-200">
                            Wide Subject
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="mt-1 text-[11px] text-slate-400">{item.description}</p>
                      )}
                    </div>

                    {/* Source Excel Column Selector & Samples */}
                    <div>
                      <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr] sm:items-center">
                        <select
                          value={item.ignored ? "__ignore__" : item.sourceColumn}
                          onChange={(e) => handleSetSourceCol(item.id, e.target.value)}
                          className={`form-input mt-0 text-xs ${
                            isConflicted
                              ? "border-rose-400 bg-rose-50/30"
                              : status === "Mapped"
                              ? "border-emerald-300 bg-emerald-50/20"
                              : status === "Pending"
                              ? "border-amber-300 bg-amber-50/20"
                              : ""
                          }`}
                        >
                          <option value="">
                            {item.key === "effectiveDate"
                              ? "-- (Optional) Default to Today (Asia/Kolkata) --"
                              : "-- Unmapped (Skip) --"}
                          </option>
                          {worksheet.headers.map((h) => {
                            if (!h.trim()) return null;
                            const sampleVals = getSampleValues(h);
                            const samplePreview = sampleVals.length ? ` (e.g. "${sampleVals[0]}")` : "";
                            return (
                              <option key={h} value={h}>
                                {h}
                                {samplePreview}
                              </option>
                            );
                          })}
                          <option value="__ignore__">-- Explicitly Ignore --</option>
                        </select>

                        {/* Sample values badge */}
                        <div className="truncate text-[11px] text-slate-500">
                          {samples.length > 0 ? (
                            <span title={samples.join(", ")}>
                              Samples:{" "}
                              <span className="font-medium text-slate-800">
                                {samples.map((s) => `"${s}"`).join(", ")}
                              </span>
                            </span>
                          ) : item.sourceColumn ? (
                            <span className="italic text-slate-400">No sample values</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </div>

                      {/* Conflict alert */}
                      {isConflicted && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                          <AlertCircle size={12} />
                          Conflicting column: &quot;{item.sourceColumn}&quot; is also mapped to{" "}
                          {columnUsage[item.sourceColumn]?.filter((l) => l !== item.label).join(", ")}.
                        </p>
                      )}
                    </div>

                    {/* Actions: Wide-subject subject mapping or Custom delete */}
                    <div className="flex items-center gap-2 justify-end">
                      {item.type === "wide-subject" && (
                        <div className="flex items-center gap-2">
                          <select
                            value={item.subjectName || ""}
                            onChange={(e) => handleSetWideSubject(item.id, e.target.value)}
                            className="form-input mt-0 py-1 text-xs"
                            title="Select matching EduPilot subject"
                          >
                            <option value="">Select subject...</option>
                            {availableSubjects.map((s) => (
                              <option key={s.id} value={s.name}>
                                {s.name} ({s.id})
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => handleToggleWideInclude(item.id)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border ${
                              item.included
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {item.included ? "Included" : "Excluded"}
                          </button>
                        </div>
                      )}

                      {item.type === "custom" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Remove custom mapping"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Checklist Footer Summary */}
        <div className="border-t border-slate-100 bg-slate-50 p-3.5 flex flex-wrap items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span>
              Total fields: <strong className="text-slate-800">{stats.total}</strong>
            </span>
            <span>
              Mapped: <strong className="text-emerald-700">{stats.mapped}</strong>
            </span>
            <span>
              Required pending:{" "}
              <strong className={stats.pending > 0 ? "text-amber-700" : "text-slate-700"}>
                {stats.pending}
              </strong>
            </span>
            {stats.wide > 0 && (
              <span>
                Wide subjects: <strong className="text-indigo-700">{stats.wide}</strong>
              </span>
            )}
            {stats.custom > 0 && (
              <span>
                Custom fields: <strong className="text-purple-700">{stats.custom}</strong>
              </span>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="font-semibold text-indigo-600 hover:underline flex items-center gap-1"
            >
              <Plus size={12} /> Add custom field mapping
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          <ArrowLeft size={15} /> Replace file
        </button>
        <button
          type="button"
          onClick={handleValidateClick}
          className="flex items-center gap-2 rounded-xl bg-[#5b5ce2] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#4d4ec9]"
        >
          Validate rows <ArrowRight size={15} />
        </button>
      </div>

      {/* Add Custom Mapping Modal */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} title="Add Column Mapping">
          <div className="space-y-4 text-xs">
            {/* 1. Source Excel Column */}
            <div>
              <label className="block font-semibold text-slate-700">Source Excel Column *</label>
              <select
                value={addSourceCol}
                onChange={(e) => setAddSourceCol(e.target.value)}
                className="form-input mt-1"
              >
                <option value="">Select source column...</option>
                {worksheet.headers.map((h) => {
                  if (!h.trim()) return null;
                  const sampleVals = getSampleValues(h);
                  const samplePreview = sampleVals.length ? ` (e.g. "${sampleVals[0]}")` : "";
                  return (
                    <option key={h} value={h}>
                      {h}
                      {samplePreview}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 2. Mapping Category */}
            <div>
              <label className="block font-semibold text-slate-700">Mapping Category</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAddCategory("custom")}
                  className={`rounded-lg border p-2 text-center text-xs font-semibold ${
                    addCategory === "custom"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Custom Field
                </button>
                <button
                  type="button"
                  onClick={() => setAddCategory("wide")}
                  className={`rounded-lg border p-2 text-center text-xs font-semibold ${
                    addCategory === "wide"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Wide Subject
                </button>
                <button
                  type="button"
                  onClick={() => setAddCategory("standard")}
                  className={`rounded-lg border p-2 text-center text-xs font-semibold ${
                    addCategory === "standard"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Standard Field
                </button>
              </div>
            </div>

            {/* 3. Conditional Options based on Category */}
            {addCategory === "custom" && (
              <>
                <div>
                  <label className="block font-semibold text-slate-700">Field Display Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Attendance Rate, Lab Score, Batch Year"
                    value={addCustomLabel}
                    onChange={(e) => setAddCustomLabel(e.target.value)}
                    className="form-input mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700">Data Type</label>
                    <select
                      value={addCustomDataType}
                      onChange={(e) => setAddCustomDataType((e.target.value as ChecklistItem["customDataType"]) || "string")}
                      className="form-input mt-1"
                    >
                      <option value="string">Text (String)</option>
                      <option value="number">Numeric Number</option>
                      <option value="percentage">Percentage (0 - 100%)</option>
                      <option value="date">Date (YYYY-MM-DD)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700">Storage Destination</label>
                    <select
                      value={addCustomStorage}
                      onChange={(e) => setAddCustomStorage((e.target.value as ChecklistItem["storageDestination"]) || "unpersisted")}
                      className="form-input mt-1"
                    >
                      <option value="unpersisted">Unpersisted (Preview Only)</option>
                      <option value="student_metadata">Student Metadata (Extended)</option>
                      <option value="progress_metadata">Progress Metadata (Extended)</option>
                    </select>
                  </div>
                </div>

                {/* Explicit Schema Extension Callout */}
                <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-[11px] text-purple-900">
                  <p className="font-semibold">MongoDB Schema Destination Notice</p>
                  <p className="mt-0.5">
                    Custom fields will be extracted and displayed in the editable preview table. Because EduPilot&apos;s current
                    MongoDB schema does not include generic metadata maps, these fields will not overwrite Student or Progress
                    documents until backend schema extensions are enabled.
                  </p>
                </div>
              </>
            )}

            {addCategory === "wide" && (
              <div>
                <label className="block font-semibold text-slate-700">Destination Institution Subject *</label>
                <select
                  value={addWideSubject}
                  onChange={(e) => setAddWideSubject(e.target.value)}
                  className="form-input mt-1"
                >
                  <option value="">Select subject...</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Values in this column will be imported as progress snapshots for this subject. Blank cells remain &quot;No update&quot;.
                </p>
              </div>
            )}

            {addCategory === "standard" && (
              <div>
                <label className="block font-semibold text-slate-700">Standard Field</label>
                <select
                  value={addStandardField}
                  onChange={(e) => setAddStandardField(e.target.value)}
                  className="form-input mt-1"
                >
                  <option value="">Select standard field...</option>
                  <option value="studentId">Student ID</option>
                  <option value="studentName">Student Name</option>
                  <option value="subject">Subject</option>
                  <option value="progressPercent">Progress Value (%)</option>
                  <option value="effectiveDate">Effective Date</option>
                  <option value="mentorNotes">Mentor Notes</option>
                </select>
              </div>
            )}

            {/* Modal Actions */}
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewMapping}
                className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
              >
                Save Mapping
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ValidationStep({
  rows,
  counts,
  onBack,
  onContinue
}: {
  rows: ImportValidationRow[];
  counts: { valid: number; warning: number; invalid: number; skipped: number };
  onBack: () => void;
  onContinue: () => void;
}) {
  const hasInvalidOnly = counts.valid === 0 && counts.warning === 0 && counts.skipped === 0 && counts.invalid > 0;

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Validation summary</h3>
          <p className="mt-1 text-xs text-slate-400">
            Review parsed records. You can advance to the editable preview to inspect and correct any invalid values.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Valid records" value={counts.valid} tone="emerald" />
        <Stat label="Warnings" value={counts.warning} tone="amber" />
        <Stat label="No update (Skipped)" value={counts.skipped} tone="slate" />
        <Stat label="Invalid records" value={counts.invalid} tone="rose" />
      </div>

      {hasInvalidOnly && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold">All records currently have validation issues</p>
          <p className="mt-1">
            Click <strong>Review & edit preview</strong> below to inspect the detailed errors, edit student IDs, subjects, dates or progress values, and revalidate.
          </p>
        </div>
      )}

      <IssueTable rows={rows} />

      <div className="mt-6 flex justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500">
          <ArrowLeft size={15} /> Back to mapping
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex items-center gap-2 rounded-xl bg-[#5b5ce2] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#4d4ecb] transition"
        >
          Review & edit preview <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

function PreviewStep({
  rows,
  counts,
  fileName,
  revalidating,
  availableStudents,
  availableSubjects,
  onUpdateRowValue,
  onUpdateRowMultipleValues,
  onDeleteRow,
  onRevalidate,
  onStudentCreated,
  onBack,
  onConfirm
}: {
  rows: ImportValidationRow[];
  counts: {
    valid: number;
    warning: number;
    invalid: number;
    skipped: number;
    existingStudentsMatched?: number;
    newStudentsToCreate?: number;
    ambiguousIdentities?: number;
    studentsMissingIdentifiers?: number;
    identityConflicts?: number;
    progressToImport?: number;
    progressSkipped?: number;
    progressRejected?: number;
    progressUnchanged?: number;
  };
  fileName: string;
  revalidating: boolean;
  availableStudents: Student[];
  availableSubjects: Subject[];
  onUpdateRowValue: (rowNumber: number, field: string, val: string) => void;
  onUpdateRowMultipleValues: (rowNumber: number, updates: Record<string, string>) => void;
  onDeleteRow: (rowNumber: number) => void;
  onRevalidate: () => void;
  onStudentCreated: (newStudent: Student, rowNumber?: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [filter, setFilter] = useState<"All" | "Valid" | "Warning" | "Invalid" | "Skipped">("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [studentToCreate, setStudentToCreate] = useState<{
    rowNumber: number;
    studentId: string;
    studentName: string;
    subject: string;
  } | null>(null);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "Valid" && r.classification !== "Valid") return false;
      if (filter === "Warning" && r.classification !== "Warning") return false;
      if (filter === "Invalid" && r.classification !== "Invalid") return false;
      if (filter === "Skipped" && r.classification !== "Skipped" && r.action !== "Skip") return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const student = (r.values.studentId || r.values.studentName || "").toLowerCase();
        const subject = (r.values.subject || "").toLowerCase();
        return student.includes(term) || subject.includes(term);
      }
      return true;
    });
  }, [rows, filter, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Editable import preview</h3>
          <p className="mt-1 text-xs text-slate-400">
            {fileName} · {rows.length} total rows · {counts.newStudentsToCreate ?? 0} new students to create · {counts.existingStudentsMatched ?? 0} existing · {counts.progressToImport ?? 0} progress to import ({counts.progressSkipped ?? 0} skipped/no update)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={revalidating}
            onClick={onRevalidate}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition"
          >
            <RefreshCw size={14} className={revalidating ? "animate-spin" : ""} />
            {revalidating ? "Revalidating…" : "Revalidate edits"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Existing Students</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{counts.existingStudentsMatched ?? 0}</p>
          <p className="mt-0.5 text-[10px] text-emerald-600">Matched in EduPilot</p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">New Students</p>
          <p className="mt-1 text-2xl font-bold text-[#5b5ce2]">{counts.newStudentsToCreate ?? 0}</p>
          <p className="mt-0.5 text-[10px] text-indigo-500">Will auto-create on confirm</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Progress To Import</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">{counts.progressToImport ?? 0}</p>
          <p className="mt-0.5 text-[10px] text-blue-600">Active progress snapshots</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Skipped / Preserved</p>
          <p className="mt-1 text-2xl font-bold text-slate-700">{counts.progressSkipped ?? 0}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Blank cells (no update)</p>
        </div>
      </div>

      {(((counts.ambiguousIdentities ?? 0) > 0) || ((counts.studentsMissingIdentifiers ?? 0) > 0) || ((counts.identityConflicts ?? 0) > 0)) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <span className="leading-relaxed">
            Identity review required: {(counts.identityConflicts ?? 0) > 0 ? `${counts.identityConflicts} name conflict(s). ` : ""}
            {(counts.ambiguousIdentities ?? 0) > 0 ? `${counts.ambiguousIdentities} ambiguous student name(s). ` : ""}
            {(counts.studentsMissingIdentifiers ?? 0) > 0 ? `${counts.studentsMissingIdentifiers} record(s) missing identifier. ` : ""}
            Please review or correct student IDs and names in the table below before confirming.
          </span>
        </div>
      )}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {(["All", "Valid", "Warning", "Invalid", "Skipped"] as const).map((tab) => {
            const count =
              tab === "All"
                ? rows.length
                : tab === "Valid"
                ? counts.valid
                : tab === "Warning"
                ? counts.warning
                : tab === "Invalid"
                ? counts.invalid
                : counts.skipped;

            return (
              <button
                type="button"
                key={tab}
                onClick={() => setFilter(tab)}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  filter === tab
                    ? "bg-[#5b5ce2] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-60">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search student or subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input pl-8 py-1.5 text-xs w-full"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[1000px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-3 w-12">Row</th>
              <th className="px-3 py-3 w-56">Student Identity & Status</th>
              <th className="px-3 py-3 w-36">Subject</th>
              <th className="px-3 py-3 w-36">Progress & Status</th>
              <th className="px-3 py-3 w-20">Previous</th>
              <th className="px-3 py-3 w-28">Change</th>
              <th className="px-3 py-3 w-36">Date</th>
              <th className="px-3 py-3">Issues / Notes</th>
              <th className="px-3 py-3 w-16 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  No records matching the filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const prev = row.previousProgress !== null && row.previousProgress !== undefined ? `${row.previousProgress}%` : "—";
                const isBlank = !row.values.progressPercent || row.values.progressPercent.trim() === "";
                const isError = row.classification === "Invalid";
                const isSkip = row.classification === "Skipped" || row.action === "Skip";

                const changeTone =
                  row.changeType === "Improving"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : row.changeType === "Decreased"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : row.changeType === "Unchanged"
                    ? "bg-slate-100 text-slate-700 border-slate-200"
                    : row.changeType === "No update"
                    ? "bg-slate-50 text-slate-500 border-slate-200"
                    : "bg-blue-50 text-blue-700 border-blue-200";

                const sStatus = row.studentStatus ?? (row.resolvedStudentId ? "Existing Student" : "New Student – Will Create");
                const pStatus = row.progressStatus ?? (isBlank ? "No Update" : "Will Import");

                return (
                  <tr key={row.rowNumber} className={isError ? "bg-rose-50/30" : isSkip ? "bg-slate-50/50" : ""}>
                    <td className="px-3 py-3 font-mono text-slate-400">{row.rowNumber}</td>
                    
                    {/* Student Identity & Status */}
                    <td className="px-3 py-3 min-w-[220px]">
                      <div className="flex flex-col gap-1.5">
                        <div>
                          {sStatus === "Existing Student" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <Check size={10} /> Existing Student
                            </span>
                          ) : sStatus === "New Student – Will Create" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-[#5b5ce2]">
                              <Sparkles size={10} /> New Student – Will Create
                            </span>
                          ) : sStatus === "Identity Conflict" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                              <AlertCircle size={10} /> Name Conflict
                            </span>
                          ) : sStatus === "Ambiguous Student" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              <AlertCircle size={10} /> Ambiguous Student
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                              <X size={10} /> Missing Identity
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            value={row.values.studentId || ""}
                            placeholder="Student ID"
                            onChange={(e) => onUpdateRowValue(row.rowNumber, "studentId", e.target.value)}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                          />
                          <input
                            type="text"
                            value={row.values.studentName || ""}
                            placeholder="Student Name (optional)"
                            onChange={(e) => onUpdateRowValue(row.rowNumber, "studentName", e.target.value)}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {availableStudents.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              const chosenId = e.target.value;
                              if (!chosenId) return;
                              const chosen = availableStudents.find((s) => s.studentId === chosenId || s.id === chosenId);
                              if (chosen) {
                                onUpdateRowMultipleValues(row.rowNumber, {
                                  studentId: chosen.studentId,
                                  studentName: chosen.fullName
                                });
                              }
                            }}
                            className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-500 hover:border-slate-300 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">-- Map to Existing Student --</option>
                            {availableStudents.map((stu) => (
                              <option key={stu.id} value={stu.studentId}>
                                {stu.studentId} · {stu.fullName}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>

                    {/* Subject */}
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={row.values.subject ?? ""}
                        placeholder="Subject name/ID"
                        onChange={(e) => onUpdateRowValue(row.rowNumber, "subject", e.target.value)}
                        className={`w-full rounded-md border px-2 py-1 text-xs focus:outline-none ${
                          !row.values.subject ? "border-rose-400 bg-rose-50/50" : "border-slate-200 focus:border-indigo-500"
                        }`}
                      />
                    </td>

                    {/* Progress & Status */}
                    <td className="px-3 py-3 min-w-[150px]">
                      <div className="flex flex-col gap-1.5">
                        <div>
                          {pStatus === "Will Import" ? (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                              <Check size={9} /> Will Import
                            </span>
                          ) : pStatus === "No Update" ? (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                              No Update
                            </span>
                          ) : pStatus === "Unchanged" ? (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                              Unchanged
                            </span>
                          ) : pStatus === "Duplicate" ? (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                              Duplicate
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700">
                              Invalid
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={row.values.progressPercent ?? ""}
                          placeholder="Blank (No update)"
                          onChange={(e) => onUpdateRowValue(row.rowNumber, "progressPercent", e.target.value)}
                          className={`w-full rounded-md border px-2 py-1 text-xs font-semibold focus:outline-none ${
                            isBlank
                              ? "border-slate-200 text-slate-400 bg-slate-50/50"
                              : "border-slate-200 text-slate-800 focus:border-indigo-500"
                          }`}
                        />
                      </div>
                    </td>

                    {/* Previous */}
                    <td className="px-3 py-3 font-semibold text-slate-500">{prev}</td>

                    {/* Change */}
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${changeTone}`}>
                        {row.changeType ?? (isBlank ? "No update" : "New")}
                        {row.difference !== null && row.difference !== undefined && row.difference !== 0
                          ? ` (${row.difference > 0 ? "+" : ""}${row.difference}%)`
                          : ""}
                      </span>
                    </td>

                    {/* Effective Date */}
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          value={row.values.effectiveDate ?? ""}
                          placeholder="YYYY-MM-DD"
                          onChange={(e) => onUpdateRowValue(row.rowNumber, "effectiveDate", e.target.value)}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-indigo-500 focus:outline-none"
                        />
                        {(row.isDateDefaulted || row.issues?.some((i) => i.code === "DATE_DEFAULTED")) && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                            Defaulted to today
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.issues && row.issues.length > 0 ? (
                        <div className="space-y-1">
                          {row.issues.map((iss, idx) => (
                            <span
                              key={idx}
                              className={`block truncate text-[11px] font-medium ${
                                iss.severity === "error"
                                  ? "text-rose-600"
                                  : iss.severity === "warning"
                                  ? "text-amber-600"
                                  : "text-slate-500"
                              }`}
                              title={iss.message}
                            >
                              • {iss.message}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-emerald-600">✓ Ready to import</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteRow(row.rowNumber)}
                        title="Remove row"
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500">
          <ArrowLeft size={15} /> Back to validation
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex items-center gap-2 rounded-xl bg-[#5b5ce2] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#4d4ecb] transition"
        >
          <CheckCircle2 size={15} /> Confirm import ({counts.newStudentsToCreate ?? 0} students to create · {counts.progressToImport ?? 0} progress)
        </button>
      </div>

      {studentToCreate && (
        <CreateStudentModal
          target={studentToCreate}
          availableSubjects={availableSubjects}
          onClose={() => setStudentToCreate(null)}
          onCreated={onStudentCreated}
        />
      )}
    </div>
  );
}

function CreateStudentModal({
  target,
  availableSubjects,
  onClose,
  onCreated
}: {
  target: { rowNumber: number; studentId: string; studentName: string; subject: string };
  availableSubjects: Subject[];
  onClose: () => void;
  onCreated: (newStudent: Student, rowNumber: number) => void;
}) {
  const [studentId, setStudentId] = useState(target.studentId || "");
  const [fullName, setFullName] = useState(target.studentName || "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }, []);
  const [enrollmentDate, setEnrollmentDate] = useState(todayStr);

  const matchedSubject = availableSubjects.find(
    (s) => s.name.toLowerCase() === target.subject.toLowerCase() || s.id === target.subject
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(matchedSubject?.id || availableSubjects[0]?.id || "");

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!studentId.trim()) {
      setFormError("Student ID is mandatory.");
      return;
    }
    if (!fullName.trim() || fullName.trim().length < 2) {
      setFormError("Student Full Name is mandatory (at least 2 characters).");
      return;
    }
    const emailTrim = email.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setFormError("Please enter a valid institutional email address, or leave it blank.");
      return;
    }
    if (!enrollmentDate) {
      setFormError("Enrollment date is mandatory.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        studentId: studentId.trim(),
        fullName: fullName.trim(),
        email: emailTrim ? emailTrim.toLowerCase() : "",
        phone: phone.trim() || undefined,
        department: department.trim() || undefined,
        enrollmentDate,
        status: "Active" as const,
        subjectIds: selectedSubjectId ? [selectedSubjectId] : []
      };

      let newStudent: Student;
      if (dataMode === "api") {
        newStudent = await apiCreateStudent(payload);
      } else {
        newStudent = createStudent(payload);
      }

      onCreated(newStudent, target.rowNumber);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create student in institution.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Create Student in Institution"
      description={`Row ${target.rowNumber} · Explicit approval required. Provide genuine student credentials (never fabricated).`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {formError && (
          <div className="rounded-lg bg-rose-50 p-3 text-rose-700 border border-rose-200">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Student ID *</label>
            <input
              type="text"
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. N26V03A0001"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. Bogi Sri Venkata Durga Prasad"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Institutional Email <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 focus:border-indigo-500 focus:outline-none"
            placeholder="e.g. bogi.prasad@limat.edu (optional)"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Optional contact email. EduPilot AI never invents or fabricates student contact details.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Enrollment Date *</label>
            <input
              type="date"
              required
              value={enrollmentDate}
              onChange={(e) => setEnrollmentDate(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Department</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. Computer Science"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. +91 98765 43210"
            />
          </div>
        </div>

        {availableSubjects.length > 0 && (
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Assign to Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">-- No Subject --</option>
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.department || "General"})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
            Create & Assign Student
          </button>
        </div>
      </form>
    </Modal>
  );
}

function IssueTable({ rows }: { rows: ImportValidationRow[] }) {
  const problemRows = rows.filter((row) => row.issues.length > 0);
  return problemRows.length === 0 ? (
    <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-xs text-emerald-700">All rows passed initial validation.</div>
  ) : (
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full min-w-[700px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-4 py-3">Row</th>
            <th className="px-4 py-3">Classification</th>
            <th className="px-4 py-3">Student / Subject</th>
            <th className="px-4 py-3">Issues</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {problemRows.slice(0, 15).map((row) => (
            <tr key={row.rowNumber}>
              <td className="px-4 py-3 font-semibold text-slate-600">{row.rowNumber}</td>
              <td className="px-4 py-3 font-semibold">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    row.classification === "Invalid"
                      ? "bg-rose-50 text-rose-600"
                      : row.classification === "Warning"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {row.classification}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {row.values.studentId || row.values.studentName || "—"} / {row.values.subject || "—"}
              </td>
              <td className="px-4 py-3 text-slate-500">{row.issues.map((item) => item.message).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {problemRows.length > 15 && (
        <p className="p-3 text-center text-xs text-slate-400">
          Showing first 15 of {problemRows.length} rows with issues. All rows can be reviewed and edited in the Preview step.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "rose" | "slate" }) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-50 text-slate-600"
  };
  return (
    <div className={`rounded-xl p-4 ${colors[tone]}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function CompleteStep({
  batch,
  summary,
  onReset
}: {
  batch: ImportBatch;
  summary?: Record<string, unknown>;
  onReset: () => void;
}) {
  const createdCount = Number(summary?.createdStudentsCount ?? 0);
  const matchedCount = Number(summary?.matchedStudentsCount ?? 0);

  return (
    <div className="py-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
        <CheckCircle2 size={28} />
      </span>
      <h3 className="mt-4 text-xl font-bold text-slate-900">Import complete</h3>
      <p className="mt-1 text-xs text-slate-500">
        Batch {batch.id} · {batch.status}
      </p>

      {/* Student stats */}
      <div className="mx-auto mt-6 max-w-xl text-left">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Student Profiles</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
            <p className="text-xs font-semibold text-indigo-700">New Students Created</p>
            <p className="mt-1 text-2xl font-bold text-[#5b5ce2]">{createdCount}</p>
            <p className="mt-0.5 text-[10px] text-indigo-500">Auto-created with minimal profiles</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
            <p className="text-xs font-semibold text-emerald-700">Existing Students Reused</p>
            <p className="mt-1 text-2xl font-bold text-emerald-800">{matchedCount}</p>
            <p className="mt-0.5 text-[10px] text-emerald-600">Preserved profiles and existing progress</p>
          </div>
        </div>
      </div>

      {/* Progress stats */}
      <div className="mx-auto mt-4 max-w-xl text-left">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Learning Progress Snapshots</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Imported" value={batch.successfulImports} tone="emerald" />
          <Stat label="Skipped (No update)" value={batch.skippedRecords} tone="slate" />
          <Stat label="Unchanged" value={batch.unchangedRecords ?? 0} tone="amber" />
          <Stat label="Rejected" value={batch.rejectedRecords} tone="rose" />
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#5b5ce2] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-100 hover:bg-[#4c4dcc] transition"
      >
        <RefreshCw size={14} /> Start another import
      </button>
    </div>
  );
}

function ImportHistory({ history, onSelect }: { history: ImportBatch[]; onSelect: (batch: ImportBatch) => void }) {
  return (
    <section className="rounded-2xl border border-[#e8ecf3] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <History size={17} className="text-indigo-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-900">Import history</h3>
          <p className="mt-1 text-xs text-slate-400">Review historical import batches and their execution summaries.</p>
        </div>
      </div>
      {history.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-400">No imports have been completed yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {history.map((batch) => (
            <button
              type="button"
              key={batch.id}
              onClick={() => onSelect(batch)}
              className="flex w-full flex-col justify-between gap-2 rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50 sm:flex-row sm:items-center"
            >
              <span>
                <span className="block text-xs font-semibold text-slate-700">{batch.fileName}</span>
                <span className="mt-1 block text-[10px] text-slate-400">
                  {batch.id} · {new Date(batch.uploadedAt).toLocaleString("en-IN")}
                </span>
              </span>
              <span className="text-xs text-slate-500">
                {batch.successfulImports} imported · {batch.skippedRecords} skipped · {batch.rejectedRecords} rejected
              </span>
              <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-600">
                {batch.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ConfirmImportModal({
  counts,
  onClose,
  onConfirm
}: {
  counts: {
    valid: number;
    warning: number;
    invalid: number;
    skipped: number;
    existingStudentsMatched?: number;
    newStudentsToCreate?: number;
    progressToImport?: number;
    progressSkipped?: number;
    progressRejected?: number;
    identityConflicts?: number;
    ambiguousIdentities?: number;
    studentsMissingIdentifiers?: number;
  };
  onClose: () => void;
  onConfirm: () => void;
}) {
  const newStudents = counts.newStudentsToCreate ?? 0;
  const existingStudents = counts.existingStudentsMatched ?? 0;
  const progressToImport = counts.progressToImport ?? (counts.valid + counts.warning);
  const progressSkipped = counts.progressSkipped ?? counts.skipped;

  return (
    <Modal
      title="Confirm import execution"
      description="Student creation and progress recording will execute as independent, atomic operations."
      onClose={onClose}
    >
      <div className="space-y-4 text-xs text-slate-600">
        {/* Student Operation Card */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 space-y-1.5">
          <p className="font-bold text-indigo-900 text-xs uppercase tracking-wider">
            1. Student Identities ({newStudents + existingStudents} Total)
          </p>
          <ul className="space-y-1 text-slate-700">
            {newStudents > 0 && (
              <li className="flex items-center gap-1.5 text-indigo-700 font-semibold">
                ✓ <strong>{newStudents} new student profile{newStudents === 1 ? "" : "s"}</strong> will be created in MongoDB.
              </li>
            )}
            {existingStudents > 0 && (
              <li className="flex items-center gap-1.5 text-emerald-700 font-medium">
                ✓ <strong>{existingStudents} existing student{existingStudents === 1 ? "" : "s"}</strong> matched and will be reused.
              </li>
            )}
            <li className="text-[11px] text-slate-500 pt-0.5">
              Notice: Student profiles are created whenever valid identifiers exist, even if progress cells are blank.
            </li>
          </ul>
        </div>

        {/* Progress Operation Card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
          <p className="font-bold text-slate-800 text-xs uppercase tracking-wider">
            2. Learning Progress Updates
          </p>
          <ul className="space-y-1 text-slate-700">
            {progressToImport > 0 ? (
              <li className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                ✓ <strong>{progressToImport} progress snapshot{progressToImport === 1 ? "" : "s"}</strong> will be saved and assigned.
              </li>
            ) : (
              <li className="text-slate-500">
                • 0 progress snapshots to import (all progress cells in this file are blank).
              </li>
            )}
            {progressSkipped > 0 && (
              <li className="text-[11px] text-slate-500">
                • <strong>{progressSkipped} blank progress cell{progressSkipped === 1 ? "" : "s"}</strong> skipped (no update). Existing historical progress is preserved.
              </li>
            )}
            {counts.invalid > 0 && (
              <li className="text-rose-600 font-medium">
                • <strong>{counts.invalid} invalid row{counts.invalid === 1 ? "" : "s"}</strong> will be rejected.
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition">
          Review again
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-xl bg-[#5b5ce2] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#4d4ecb] transition"
        >
          Confirm & Execute Import
        </button>
      </div>
    </Modal>
  );
}

function BatchModal({ batch, onClose }: { batch: ImportBatch; onClose: () => void }) {
  return (
    <Modal title={`${batch.fileName} report`} description={`${batch.id} · ${batch.status}`} onClose={onClose}>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {batch.errors.length === 0 ? (
          <p className="rounded-xl bg-emerald-50 p-4 text-xs text-emerald-700">No rejected or skipped records.</p>
        ) : (
          batch.errors.map((row) => (
            <div key={row.rowNumber} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Row {row.rowNumber} ({row.values.studentId || row.values.studentName || "Unknown"} - {row.values.subject || "Unknown"})
                </span>
                <span className="text-[10px] font-semibold text-rose-600">{row.classification}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{row.issues.map((issue) => issue.message).join(" · ")}</p>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
