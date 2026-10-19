# SchemaPilot — Database Metadata Intelligence Platform

A runnable platform for exploring MySQL database metadata with FastAPI and React + TypeScript.

## Features
- MySQL database inspection via SQLAlchemy Inspector & PyMySQL
- Metadata API for schemas, tables, columns, primary keys, foreign keys, indexes, and constraints
- Table inventory with column & constraint counts
- Table details view with column types, nullability, keys, and indexes
- Paginated read-only table data preview
- E-commerce sample schema and seed data for MySQL (`database/init_mysql.sql`)
- Swagger documentation at `/docs`

> **Note:** This platform operates in **read-only mode**. It inspects schema metadata and executes paginated `SELECT` queries for previewing records. It does not alter schemas or modify rows.

---

## Prerequisites
- **Python 3.10+** (Python 3.11–3.13 recommended)
- **Node.js 18+** & **npm**
- **MySQL 8.0+** (or compatible MySQL / MariaDB server running locally on port 3306)

---

## 1. Create the MySQL Sample Database

Open **Windows PowerShell** or **Command Prompt** and execute:

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS schemapilot;"
mysql -u root -p schemapilot < .\database\init_mysql.sql
```

*Alternatively, open `database/init_mysql.sql` in **MySQL Workbench** or your preferred database tool and execute the script.*

---

## 2. Start the Backend (Windows PowerShell)

Open a PowerShell terminal and run:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If `.env` does not already exist, copy from the template:

```powershell
Copy-Item .env.example .env
```

Configure your MySQL connection string in `backend/.env`:

```env
DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/schemapilot
CORS_ORIGINS=http://localhost:5173
```

> **Tip:** If your password contains special characters (like `@`, `:`, `#`, `%`, or `/`), make sure to URL-encode them (e.g. `@` becomes `%40`, `#` becomes `%23`). If root has no password, use: `mysql+pymysql://root:@localhost:3306/schemapilot`.

Start the backend server:

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

- Interactive Swagger API docs: **http://localhost:8000/docs**
- Health endpoint: **http://localhost:8000/api/health**

---

## 3. Start the Frontend (Windows PowerShell)

Open a second PowerShell terminal and run:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open your browser at **http://localhost:5173** to view the SchemaPilot dashboard.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status and database connectivity check |
| `GET` | `/api/schemas` | List accessible schemas / databases |
| `GET` | `/api/summary?schema=...` | Aggregate counts for tables, columns, keys, indexes, and constraints |
| `GET` | `/api/tables?schema=...` | List tables in schema with column and constraint counts |
| `GET` | `/api/tables/{table_name}/metadata?schema=...` | Detailed metadata for a table (columns, PKs, FKs, indexes, constraints) |
| `GET` | `/api/tables/{table_name}/rows?schema=...&limit=25&offset=0` | Read-only paginated row preview |

---

## 4. Deploying to Vercel & Connecting Your Local Backend

When you deploy your frontend to **Vercel** (`https://your-app.vercel.app`), web browsers strictly block insecure `http://` calls to `localhost:8000` due to **HTTPS Mixed Content security policies**.

To connect your Vercel-deployed frontend to a backend running locally on your computer:

### Step 1: Ensure Backend is Running with CORS Allowed
Make sure `backend/.env` has:
```env
CORS_ORIGINS=*
```
Start your backend:
```powershell
python -m uvicorn app.main:app --reload --port 8000
```

### Step 2: Create a Free HTTPS Tunnel
In a new terminal window, expose your port 8000 over HTTPS:

**Option A (Zero install, no signup needed):**
```bash
npx localtunnel --port 8000
```
*Gives you an HTTPS link like: `https://xxxx.loca.lt`*

**Option B (Ngrok):**
```bash
ngrok http 8000
```
*Gives you an HTTPS link like: `https://xxxx.ngrok-free.app`*

### Step 3: Connect in the Frontend
- **From within the UI**: Open your Vercel website, click the **"API: ..."** button in the top navigation bar, paste your tunnel HTTPS URL, and click **Save & Apply Connection**!
- **OR via Vercel Environment Variables**: Go to Vercel Dashboard → Project Settings → **Environment Variables**, add `VITE_API_BASE_URL=https://your-tunnel-url`, and redeploy.

---

## Security Notes
- Passwords and credentials are never returned by the API or exposed in error messages.
- The backend enforces read-only operations; table names are validated against database metadata before querying.
- Keep `.env` files untracked in `.gitignore`.

