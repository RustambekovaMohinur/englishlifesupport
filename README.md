# English Life LMS

A production-oriented Learning Management System for the **English Life** learning center (Andijan, Uzbekistan) — one teacher, 500+ students. Real PostgreSQL persistence, real FastAPI backend, real React frontend. No mock data anywhere.

> **Status note:** This codebase was written in a sandbox with no network access and no PostgreSQL server, so while every file was carefully written and the Python source is syntax-verified, **nothing here has been run end-to-end yet**. Follow the steps below on your own machine to install dependencies, run migrations, and actually boot the app — you should expect to fix a handful of small issues (a missed import, a version pin, etc.) as you do, which is normal for a first real run of a project this size.

---

## Architecture

```
/backend   FastAPI + SQLAlchemy 2.x + Alembic + PostgreSQL + JWT auth
/frontend  React + TypeScript + Vite + Tailwind CSS
```

Two roles only: **TEACHER** (full management access) and **STUDENT** (self-service, own-data-only access). There is no separate admin panel — the teacher panel covers both teaching and management functions.

---

## 1. Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env:
#  - set a real PostgreSQL connection string (create the DB first, see below)
#  - set JWT_SECRET_KEY to a long random string (e.g. `openssl rand -hex 64`)
#  - set BOOTSTRAP_TEACHER_EMAIL / BOOTSTRAP_TEACHER_PASSWORD to your teacher login
```

### Create the database

```bash
# using psql
createuser englishlife --pwprompt
createdb englishlife -O englishlife
```

Make sure `DATABASE_URL` (sync, used by Alembic) and `ASYNC_DATABASE_URL` (async, used by FastAPI) in `.env` both point at that database.

### Run migrations

```bash
alembic upgrade head
```

This creates all tables (`users`, `refresh_tokens`, `teacher_profiles`, `student_profiles`, `groups`, `assignments`, `submissions`, `grades`) with the constraints and indexes described in the spec.

### Start the API

```bash
uvicorn app.main:app --reload --port 8000
```

On first startup, the app automatically creates the **one teacher account** from your `.env` bootstrap credentials (idempotent — it only runs if no teacher exists yet). There is intentionally no public "register as teacher" endpoint; public registration only creates student accounts.

API docs (non-production only): `http://localhost:8000/api/docs`

---

## 2. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`. The Vite dev server proxies `/api/*` to `http://localhost:8000` (see `vite.config.ts`), so no CORS configuration is needed in development beyond what's already in the backend `.env` (`CORS_ORIGINS`).

For a production build: `npm run build` (outputs to `frontend/dist`), served by any static host or reverse-proxied alongside the API.

---

## 3. Test credentials

After running the backend once with the default `.env.example` values:

- **Teacher login:** `teacher@englishlife.uz` / `ChangeMe123!`
- **Students:** register via the "Create an account" link on the login page — self-registration always creates a student account.

**Change the bootstrap password before deploying anywhere real.**

---

## What's implemented

- Argon2id password hashing, JWT access (15 min) + refresh (14 day) tokens, refresh tokens stored/revocable in the DB, rate limiting on login/register, role re-verified against the DB on every request (never trusts the JWT role claim blindly for anything beyond routing hints, and the frontend role check is cosmetic only)
- Full relational schema with FKs, unique constraints, check constraints (`score` 0–10, `stars` 2–5), and indexes sized for 500+ students
- Server-side pagination/search/filtering for the student list and submission list — the frontend never loads the full student roster at once
- Secure file upload for homework (image/PDF/DOC): allow-listed content types, random generated filenames, streamed writes with a size cap, path-traversal-safe file resolution, and per-submission access control (only the owning student or the teacher can download a file)
- Teacher: dashboard stats, student management (search/filter/edit/activate/deactivate), group CRUD, assignment CRUD, submission review + grading (score/feedback/stars) with automatic recomputation of each student's total stars
- Student: dashboard, browse assignments for their group, submit/resubmit homework (text and/or file) before the deadline or before grading, view submissions, view graded results and feedback, view stars/progress
- Global exception handling that never leaks stack traces, security headers, structured 401/403 responses

## Known limitations / what's left for you to finish

- **Not yet run against a real database** — run the steps above and expect to debug the first pass.
- **Refresh token rotation** revokes on logout but does not rotate the token on every `/auth/refresh` call (it reuses the same `jti` until expiry). Add rotation if you need tighter security.
- **No email verification** on student self-registration.
- **No password reset flow** yet (`generate_opaque_token()` is provided in `app/core/security.py` as a starting point).
- **No automated tests** (pytest/Vitest) were written — worth adding before production use, especially around the authorization boundaries in `app/api/deps.py` and `app/api/routes/submissions.py`.
- **Logo/branding**: no logo file was actually supplied to this build; `Logo` in `frontend/src/components/ui.tsx` is a placeholder "EL" mark — swap in your real asset.
- **Deployment**: no Dockerfile/CI included. `UPLOAD_DIR` is local disk; the upload code is structured (relative paths, metadata in Postgres) to make swapping to S3-compatible storage later straightforward, but that swap itself isn't done.
