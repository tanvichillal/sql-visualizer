# SQL Query Visualizer — Full Stack

## Project Structure
```
sql-visualizer-full/
├── backend/    Spring Boot (Java) — runs on localhost:8080
└── frontend/   React + Vite — runs on localhost:5173
```

## Quick Start

### 1. Backend (Spring Boot)
```bash
cd backend
mvn spring-boot:run
```
Backend starts at **http://localhost:8080**

### 2. Frontend (React + Vite)
```bash
cd frontend
pnpm install   # or: npm install
pnpm dev       # or: npm run dev
```
Frontend starts at **http://localhost:5173**

## API Endpoints (Spring Boot)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/visualize` | Execute & visualize a SQL query |
| GET  | `/api/health`    | Health check |

## Features
- **SQL Workspace** — write & run queries against the Spring Boot backend
- **Step-by-step execution** — see each clause (FROM → JOIN → WHERE → GROUP BY → SELECT → ORDER BY) with intermediate row data
- **Table import** — paste tables directly from LeetCode / Codeforces / HackerRank (auto-converts to CREATE TABLE + INSERT SQL)
- **Query history** — every executed query is saved automatically
- **Save queries** — star any query to keep it in Saved Queries
- **Dark / Light theme**
