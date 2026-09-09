**# PREZNT: AI-Based Attendance System using Facial Recognition**

PREZNT is a production-ready, AI-powered attendance management system designed for academic institutions. Built for Geethanjali College of Engineering and Technology (GCET), it replaces traditional roll-call and paper-based attendance with a secure, contactless facial recognition workflow. The platform ensures that only verified college email holders (@gcet.edu.in) can access the system, and it distinguishes between students and professors through role-based access control.

The system addresses common attendance challenges such as proxy marking, manual record errors, delayed reporting, and lack of real-time visibility. Students enroll their face once during registration, after which attendance can be marked automatically when a professor starts a live session. Professors can initiate subject-specific sessions, monitor attendance in real time, approve late requests, manage re-enrollments, and generate analytics reports.

PREZNT is built as a modern web application using TanStack Start, React 19, TypeScript, and Tailwind CSS, with Lovable Cloud (Supabase) providing managed authentication, Postgres database, Row-Level Security (RLS), and real-time subscriptions. Face detection and recognition are handled in the browser using face-api.js with Euclidean-distance matching, keeping biometric data on the user's device while attendance records are stored securely in the cloud.

Key features include: college-email-only authentication with email confirmation; role-based signup for students and professors; real-time professor session sync across devices; facial-recognition and QR-based attendance marking; automated attendance percentage calculation with daily bonus/penalty logic; late attendance approval workflow; re-enrollment request handling; professor analytics dashboard with exportable reports; mark corrections and audit logging; notification center; and a responsive dark-themed UI optimized for both desktop and mobile use.

The result is a reliable, scalable, and user-friendly attendance platform that reduces administrative overhead, prevents fraudulent entries, and gives students and faculty instant visibility into attendance status.

Keywords: Facial recognition, attendance management, AI, real-time sync, Supabase, React, TanStack Start, Row-Level Security, academic automation.

Before you run this install bun for windows use the commands mentioned below in vscode terminal
1. powershell -c "irm bun.sh/install.ps1|iex"
2. bun --version
3. bun install
4. Test-Path "$env:USERPROFILE\.bun\bin\bun.exe"
5. bun run dev
