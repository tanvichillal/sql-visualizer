# QueryFlow — SQL Query Execution Visualizer 🚀

QueryFlow is an interactive SQL query execution visualizer designed to help developers and students understand how SQL queries are processed internally.

Instead of only displaying the final result, QueryFlow breaks a SQL query into logical execution stages and visualizes the intermediate data produced at each step.

The project is being developed as a full-stack application with a React frontend and a FastAPI-based backend.

---

## ✨ Features

- 📝 Interactive SQL query workspace
- ▶️ Execute SQL queries and view results
- 🔍 Step-by-step SQL execution visualization
- 📊 View intermediate rows after each SQL clause
- 📥 Import tables from coding platforms
- 🕘 Query history
- ⭐ Save frequently used queries
- 🌙 Dark and light theme support
- 🎯 Beginner-friendly SQL learning experience

---

## 🧠 SQL Execution Visualization

QueryFlow visualizes the logical execution order of SQL queries.

```sql
SELECT
FROM
JOIN
WHERE
GROUP BY
HAVING
ORDER BY
LIMIT
```

For example:

```sql
SELECT department, COUNT(*)
FROM employees
WHERE salary > 50000
GROUP BY department
ORDER BY COUNT(*) DESC;
```

QueryFlow breaks the query into multiple stages:

```text
FROM
 ↓
WHERE
 ↓
GROUP BY
 ↓
SELECT
 ↓
ORDER BY
```

At every stage, users can inspect the intermediate table and understand how the final result is generated.

---

## 🛠️ Tech Stack

### Frontend

- React.js
- TypeScript
- Vite
- Tailwind CSS

### Backend

- FastAPI
- Python
- SQL Parsing and Query Processing
- REST APIs

### Database

- SQL Database Engine

---

## 🏗️ Project Architecture

```text
sql-visualizer
│
├── backend
│   ├── api
│   ├── models
│   ├── services
│   ├── parser
│   └── main.py
│
├── frontend
│   ├── src
│   │   ├── app
│   │   ├── components
│   │   ├── imports
│   │   └── styles
│   │
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

## ⚙️ How It Works

1. The user writes a SQL query in the SQL workspace.
2. The frontend sends the query to the FastAPI backend.
3. The backend parses the SQL query.
4. The query is divided into logical execution stages.
5. Each SQL clause is processed sequentially.
6. Intermediate table states are generated.
7. The execution steps are returned through REST APIs.
8. The React frontend visualizes every stage.

---

## 🔄 SQL Logical Execution Order

SQL queries are logically processed in the following order:

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT
```

QueryFlow helps users understand this process visually.

---

## 🚀 Getting Started

### Clone the Repository

```bash
git clone <repository-url>
cd sql-visualizer
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on:

```text
http://localhost:5173
```

### Backend Setup

The backend is being migrated to FastAPI.

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

#### Windows

```bash
venv\Scripts\activate
```

#### macOS / Linux

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the FastAPI server:

```bash
uvicorn main:app --reload
```

The backend will run on:

```text
http://localhost:8000
```

---

## 🔌 Planned API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/visualize` | Execute and visualize a SQL query |
| POST | `/api/parse` | Parse SQL query |
| GET | `/api/history` | Retrieve query history |
| POST | `/api/save` | Save a SQL query |
| GET | `/api/health` | Backend health check |

---

## 📌 Future Enhancements

- 🤖 AI-powered SQL query explanation
- 🧠 AI SQL debugging assistant
- 📈 Query optimization suggestions
- 🔥 Query execution plan visualization
- 🗄️ Support for multiple SQL databases
- 🎓 Interactive SQL learning mode
- 🧩 Complex JOIN visualization
- 📊 Performance analysis
- 💬 Natural language to SQL
- 🔐 User authentication

---

## 🎯 Project Goal

The goal of QueryFlow is to make SQL execution easier to understand through interactive visualization.

It is especially useful for:

- Students learning SQL
- Developers preparing for technical interviews
- Beginners understanding SQL execution order
- Developers debugging complex SQL queries

---

## 🤝 Contributions

Contributions, suggestions, and improvements are welcome.

Feel free to fork the repository and submit a pull request.

---

## 👩‍💻 Author

**Tanvi Chillal**

Full Stack Developer | AI & Backend Enthusiast

---

⭐ If you find QueryFlow useful, consider starring the repository.
