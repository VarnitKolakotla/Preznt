## Goal

Replace localStorage auth and data with Lovable Cloud (managed Postgres + Auth). Login uses your college email (must end in `@gcet.edu.in`) with email confirmation. Professor sessions become real-time and work across devices.

## What changes for you

- Sign up with your college email → confirm via emailed link → sign in.
- Signup is restricted to `@gcet.edu.in`. Role (Student / Professor) is chosen at signup.
- When a professor starts an attendance session, every logged-in student sees it instantly, on any device.
- Attendance records, late requests, and re-enrollment requests live in the database.
- Face descriptors stay in the browser (they're device-specific; re-enroll on each device).
- All existing localStorage demo data is ignored — fresh start.

## Database schema (new)

- `profiles` — one row per user: `id` (FK auth.users), `name`, `id_number`, `email`, `subjects[]`.
- `user_roles` — enum `app_role` = `student | professor`; separate table (never on profile) with `has_role()` security-definer helper.
- `prof_sessions` — active sessions: professor id, subject, class time, `started_at`, `expires_at`, `late_deadline`, `is_active`.
- `attendance_records` — student id, subject, timestamp, date, time, status (`Present`/`Late`), confidence, method (`face`/`qr`).
- `late_requests` — session id, student id, subject, face confidence, status (`pending`/`approved`/`denied`).
- `reenroll_requests` — student id, status.

All tables get GRANTs + RLS.

## RLS policy summary

- `profiles`: everyone authenticated can read (needed to show names); users update only their own.
- `user_roles`: user reads own; only professors can grant/revoke via a definer function.
- `prof_sessions`: any authenticated user reads active sessions; only professors insert/update their own.
- `attendance_records`: student reads own; professors read all; students insert their own via a definer RPC that validates the active session and face confidence.
- `late_requests` / `reenroll_requests`: student inserts own; professors read/update all.

## Auth rules (enforced in database)

- Trigger on `auth.users` insert: if email domain ≠ `gcet.edu.in`, raise exception (blocks signup).
- Trigger on `email_confirmed_at` update: create `profiles` row and insert `user_roles` row from signup metadata (role, name, id_number, subjects). Roles only granted after verified email — no privilege-escalation window.
- Email confirmation ON. Signup form collects: email, password, full name, ID number, role, and (for professors) subjects.

## Realtime

Enable Postgres realtime on `prof_sessions`, `late_requests`, `reenroll_requests`, `attendance_records`. Student `/scan` subscribes to `prof_sessions` and lights up the moment a professor starts one — no polling, no same-browser limitation.

## Code changes

- Enable Lovable Cloud (creates Supabase project, injects publishable env vars, generates typed client).
- New `src/routes/auth.tsx` (public) with sign-up + sign-in tabs, domain validation, role picker.
- Delete `src/routes/login.tsx`; redirect to `/auth`.
- Move all app routes (`/`, `/scan`, `/enroll`, `/records`, `/settings`) under `src/routes/_authenticated/` — integration ships the auth gate.
- Rewrite `src/lib/storage.ts`:
  - Remove `useAuth`, `useStored`, seed data, `DEMO_USERS`, PBKDF2 hashing (Supabase Auth handles it), all in-app password code.
  - Keep: face-descriptor helpers (localStorage), date utils, `computeAttendance`, `computeStreak`, schedule helpers.
  - Add: `useProfile()`, `useActiveSession()`, `useMyRecords()`, `useLateRequests()`, `useReenrollRequests()` — all backed by TanStack Query + Supabase, with realtime subscriptions where relevant.
- Rewrite `src/components/app-shell.tsx` to read auth from Supabase session and expose sign-out.
- Rewrite `/scan`:
  - Professor: `INSERT` into `prof_sessions`, `UPDATE` on end.
  - Student: subscribe to `prof_sessions` (realtime), submit attendance via server function that validates the session.
  - Remove the client-side "Confirm professor scanned" bypass (already fixed prior).
- Rewrite `/records`: query `attendance_records` for current user (student) or all (professor).
- Update all four routes' `head()` with route-specific SEO.

## Out of scope (this pass)

- Password reset flow (can add after — needs `/reset-password` public route).
- Google/Apple SSO.
- Migrating old localStorage records into the DB.
- Timetable / schedule stays in code (`src/lib/schedule.ts`) — not moved to DB.

## Rollout

1. Enable Lovable Cloud.
2. Create schema + RLS + triggers migration.
3. Configure auth (enable email confirmation, set site URL).
4. Build `/auth` page.
5. Refactor storage layer + routes.
6. Move routes under `_authenticated/`.
7. Verify: sign up with your `23r11a0525@gcet.edu.in`, confirm email, sign in, start a professor session in one browser and see it in another.

## Estimated impact

~15 files edited or created, one migration, ~600 lines of code churn. Expect the app to be briefly unusable mid-refactor until all routes are ported.
