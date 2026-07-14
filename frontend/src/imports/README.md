# SQL Query Visualizer — Frontend

Modern React + Vite + Tailwind v4 UI for the SQL Tutor Spring Boot backend.

## Quick start

```bash
# 1. install
bun install        # or: npm install

# 2. configure Firebase (optional but required for auth, history, saved queries)
cp .env.example .env
# fill in values from Firebase console → Project Settings → SDK setup
# Enable Email/Password and Google providers in Firebase Auth.
# Create a Firestore database (test mode is fine to start).

# 3. start the Java backend separately on http://localhost:8080
#    (the Vite dev server proxies /api → :8080)

# 4. run frontend
bun run dev        # http://localhost:5173
```

## Without Firebase

The app still runs — history and saved queries fall back to browser `localStorage`,
and the auth-gated dashboard pages are accessible without sign-in.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Landing page |
| `/login`, `/signup`, `/forgot-password` | Auth (Firebase) |
| `/dashboard` | Personalised home (protected if Firebase enabled) |
| `/visualizer` | Main SQL workspace with resizable panels |
| `/history` | Past queries (protected) |
| `/saved` | Pinned visualizations (protected) |
| `/practice` | Curated SQL problems |

## Stack additions in v2

- `react-router-dom` — routing
- `firebase` — auth + firestore for history/saved
- `react-resizable-panels` — IDE-style resizable layout
- `framer-motion` — landing/dashboard animations
- `lucide-react` — icon set
- `sonner` — toast notifications

Backend is **untouched** — same `POST /api/visualize` contract as before.
