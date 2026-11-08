# EduPilot AI backend

Independent Express + TypeScript + MongoDB API for EduPilot AI.

The foundation validates startup configuration with Zod, configures Express security headers and CORS, exposes centralized errors, and reports MongoDB readiness independently from API availability. `GET /api/health` returns HTTP 200 when MongoDB is connected and HTTP 503 when the API is running without a database connection.

## Authentication

Authentication uses `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`. Login issues an eight-hour, HTTP-only JWT cookie; production cookies are marked `Secure` and use `SameSite=Lax`. Cookie-authenticated state changes require the CSRF token from `GET /api/auth/csrf` in the `x-csrf-token` header, and requests with an `Origin` header must match `FRONTEND_ORIGIN`.

There is no unrestricted registration endpoint. Use the one-time frontend `/setup` wizard or `POST /api/setup/initialize` to create the first Institution and Admin. Authentication rechecks the active User and Institution in MongoDB on every protected request, so role and tenant changes take effect without waiting for an old token to expire. `requireRole` and `requireInstitutionScope` are reusable for later resource routes.

## Local development

1. Copy `.env.example` to `.env` and provide a real `MONGODB_URI` and long `JWT_SECRET`.
2. Install dependencies with `npm install`.
3. Start MongoDB locally.
4. Run `npm run dev`.
5. Check `http://localhost:4000/api/health`.

The API listens on `http://localhost:4000` by default. Authentication uses the `edupilot_session` HTTP-only cookie plus a CSRF double-submit token for authenticated state-changing requests. CORS only allows `FRONTEND_ORIGIN`.

## MongoDB Atlas

Create an Atlas project and database user, add the development IP range to Network Access, copy the `mongodb+srv://...` connection string into `MONGODB_URI`, and keep that value only in `backend/.env`. Never place it in a Next.js environment variable or frontend file. Atlas replica sets support the transactions needed for future multi-collection import workflows.

The setup workflow is rate-limited, rejects repeated initialization, hashes the password with bcrypt, and creates the Institution and Admin in one MongoDB transaction. MongoDB Atlas or another replica-set deployment is required for that transaction.

## MongoDB models and indexes

Model definitions are separated under `src/models/` and re-exported from `src/models/index.ts`. Institution-owned documents carry `institutionId`; tenant scope must be derived from the authenticated user in later service/controller work rather than trusted from frontend input.

- Students: unique `{ institutionId, studentId }`.
- Subjects: unique `{ institutionId, subjectId }`.
- Users: unique `{ institutionId, email }` with `passwordHash` excluded by default.
- Assignments: partial unique active index on `{ institutionId, studentId, subjectId, status }`; removed assignments can be retained without blocking a later active assignment.
- Progress records: unique `{ institutionId, studentId, subjectId, effectiveDate }`; ordinary updates are new documents, while corrections are separate audit documents.
- Import batches: unique institution-scoped `batchId` and `idempotencyKey`.

The model tests validate schema rules and declared indexes without connecting to a database. Duplicate-key behavior should also be verified against an isolated MongoDB test database before production rollout.

## API groups

- `GET /api/auth/csrf`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/setup/status`, `POST /api/setup/initialize`
- `GET /api/dashboard/overview?limit=8`
- `GET|POST /api/students`, `GET|PATCH|DELETE /api/students/:id`, `GET /api/students/:id/subjects`, `GET /api/students/:id/progress`
- `GET|POST /api/subjects`, `GET|PATCH|DELETE /api/subjects/:id`, `GET /api/subjects/:id/progress`
- `POST|DELETE /api/assignments`, `GET /api/assignments/subject/:subjectId`
- `GET|POST /api/progress`, `GET /api/progress/:id`, `GET /api/progress/compare`, `POST /api/progress/:id/correction`, `GET /api/progress/corrections`
- `POST /api/imports/preview`, `POST /api/imports/:id/execute`, `GET /api/imports`

## Student, subject and assignment API contract

All endpoints below require authentication. The backend derives `institutionId` from the authenticated User; clients must not send it as an authorization field.

- `POST /api/students` creates a student and returns `{ data: student }` with HTTP 201.
- `GET /api/students?q=ada&status=Active&page=1&limit=25&sort=fullName&order=asc` returns `{ data: students, meta: { page, limit, total, pages } }`.
- `GET /api/students/:id` returns `{ data: student }`.
- `PATCH /api/students/:id` updates validated fields and returns `{ data: student }`.
- `DELETE /api/students/:id` archives the student as `Inactive`; it never removes historical data.
- `POST /api/subjects`, `GET /api/subjects`, `GET /api/subjects/:id`, and `PATCH /api/subjects/:id` use the same `{ data }`/pagination shape. Subject lists include `enrolledStudentCount`.
- `DELETE /api/subjects/:id` archives the subject as `Archived` rather than deleting historical references.
- `POST /api/students/:studentId/subjects` accepts `{ "subjectId": "..." }` and creates or reactivates an assignment.
- `GET /api/students/:studentId/subjects` returns active assignments with populated subjects.
- `DELETE /api/students/:studentId/subjects/:subjectId` marks the assignment `Removed`.

The current permission matrix is: Admin and Mentor can create/update/archive students and assign/remove subjects; only Admin can create/update/archive subjects; all authenticated roles can read institution-scoped records. Duplicate identifiers return `409`, invalid payloads return `400`, missing authentication returns `401`, insufficient role returns `403`, and records outside the institution are presented as `404`.

## Historical progress API contract

- `POST /api/progress` accepts `{ studentId, subjectId, progressPercent, effectiveDate, mentorNotes? }` and returns `{ data: progressRecord }` with HTTP 201. `updatedBy` and `institutionId` come from the authenticated user.
- `GET /api/progress?studentId=&subjectId=&from=&to=&page=1&limit=25&sort=effectiveDate&order=asc` returns chronological records plus pagination metadata.
- `GET /api/progress/:id`, `GET /api/students/:studentId/progress`, and `GET /api/students/:studentId/progress/:subjectId` return institution-scoped historical records with `effectiveDate`, `recordedAt`, `progressPercent`, `updatedBy`, `mentorNotes`, and `recordType`.
- `GET /api/progress/compare?studentId=&subjectId=&earlierDate=&laterDate` selects the latest snapshot on or before each date and returns `difference` in percentage points plus `Improving`, `Unchanged`, `Decreased`, or `No update`.
- `GET /api/progress/summary?studentId=&subjectId=&from=&to=` returns current, previous, change-in-points, status, last recorded date, and update count.
- `POST /api/progress/:id/corrections` accepts `{ correctedValue, reason }` and creates a separate audit record. The singular `/correction` path remains as a compatibility alias.

Progress corrections are audit-only in this phase: normal comparisons use the original append-only `ProgressRecord` snapshots and never mutate or replace them. A corrected value becomes part of normal progress only when a new progress snapshot is explicitly recorded. Duplicate student-subject-effective-date submissions are rejected by the database unique index with HTTP 409.

## Spreadsheet import API contract

CSV, XLSX and legacy XLS uploads are supported through the pinned SheetJS Community Edition 0.20.3 adapter. SheetJS CE is Apache 2.0 licensed; retain the required attribution in product open-source disclosures.

- `POST /api/imports/preview` — authenticated Admin or Mentor multipart upload with field `file`, JSON `mapping` form field, optional JSON `worksheets` array, and required `Idempotency-Key` header. The response contains workbook type, worksheet names/headers, selected normalized rows, counts, and row-level issues. Mapping may be a shared field mapping or an object keyed by worksheet name for independent mappings. It creates Preview `ImportBatch`/error metadata only; it does not create `ProgressRecord` documents.
- `POST /api/imports/:id/confirm` — revalidates the Preview batch, imports valid rows as `recordType: "Import"`, preserves effective dates, and records `importBatchId`. The previous `/execute` path remains a compatibility alias.
- `GET /api/imports?page=1&limit=25` — paginated institution-scoped import history with uploader summary.
- `GET /api/imports/:id` — institution-scoped batch detail.
- `GET /api/imports/:id/errors?page=1&limit=25` — institution-scoped row-level validation errors.

The lifecycle is `Preview` → `Completed`, `Partially completed`, or `Failed`. Existing snapshots and duplicate rows are skipped; invalid rows are rejected; successful rows are append-only progress records. The preview and confirmation paths are intentionally partial-failure tolerant and use one progress write per valid row rather than a transaction. Multi-document atomic import is not assumed because MongoDB transactions require an Atlas replica set or another transaction-capable deployment.

Workbook parsing is bounded to 5 MB, 20 worksheets, 5,000 data rows, and 500,000 cells per worksheet. Formula cells are never evaluated: cached values are used when present and empty formula results remain empty. Macro sheets are rejected, VBA metadata is not loaded, and external links are not followed. Empty sheets and malformed files are reported safely.

All protected resources are filtered by the authenticated user's institution. Ordinary progress writes are append-only; corrections create separate audit records. Student deletion is archival (`Inactive`) to preserve history.

## Import boundary

The backend accepts `.csv`, `.xlsx`, and `.xls` only. File extensions and MIME types are checked, then the actual file signature is validated before parsing. Import preview must be approved before execution. XLSM, XLSB, macro-enabled content, and unsupported workbook formats are rejected.
