# EduPilot AI backend

Independent Express + TypeScript + MongoDB API for EduPilot AI.

## Local development

1. Copy `.env.example` to `.env` and provide a real `MONGODB_URI` and long `JWT_SECRET`.
2. Install dependencies with `npm install`.
3. Start MongoDB locally.
4. Run `npm run dev`.

The API listens on `http://localhost:4000` by default. Authentication uses the `edupilot_session` HTTP-only cookie plus a CSRF double-submit token for authenticated state-changing requests. CORS only allows `FRONTEND_ORIGIN`.

## MongoDB Atlas

Create an Atlas project and database user, add the development IP range to Network Access, copy the `mongodb+srv://...` connection string into `MONGODB_URI`, and keep that value only in `backend/.env`. Never place it in a Next.js environment variable or frontend file. Atlas replica sets support the transactions needed for future multi-collection import workflows.

There is no public admin registration endpoint. For a first administrator, set the `INITIAL_ADMIN_*` and `INITIAL_INSTITUTION_*` placeholders in the process environment for one invocation and run `npm run create-admin`, then remove those values.

## API groups

- `GET /api/auth/csrf`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET|POST /api/students`, `GET|PATCH|DELETE /api/students/:id`, `GET /api/students/:id/subjects`, `GET /api/students/:id/progress`
- `GET|POST /api/subjects`, `GET|PATCH|DELETE /api/subjects/:id`, `GET /api/subjects/:id/progress`
- `POST|DELETE /api/assignments`, `GET /api/assignments/subject/:subjectId`
- `GET|POST /api/progress`, `GET /api/progress/:id`, `GET /api/progress/compare`, `POST /api/progress/:id/correction`, `GET /api/progress/corrections`
- `POST /api/imports/preview`, `POST /api/imports/:id/execute`, `GET /api/imports`

All protected resources are filtered by the authenticated user's institution. Ordinary progress writes are append-only; corrections create separate audit records. Student deletion is archival (`Inactive`) to preserve history.

## Import boundary

The backend currently accepts CSV uploads only. `.xlsx` and `.xls` are rejected explicitly until a real SheetJS/Pandas/OpenPyXL adapter is added and tested. Import preview must be approved before execution.
