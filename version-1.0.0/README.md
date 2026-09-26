# Glom data-house — v1.0.0 (first MVP rollout)

Glom data-house is a members directory: a React front end and an Express/Postgres
API over a single `members` table. v1.0.0 is the **first MVP rollout** — the
smallest end-to-end slice of the product that is genuinely usable, not a finished
system. Read the "MVP scope" section for what is deliberately missing.

## What v1.0.0 does

- Browse every member on record in a sortable directory.
- Search by first, last, or preferred name; filter by gender, marital status, and
  title.
- Sort by name, title, gender, marital status, or date of birth, ascending or
  descending, with untitled/empty values always last.
- View a single member's full record.
- Create, edit, and delete members.
- All list state (search, filters, sort, direction) lives in the URL, so any view
  is linkable and survives a reload.

## Architecture

```
glom_db/
  backend/     Express 5 API, node-postgres pool, Supabase auth middleware
  frontend/    React 19 + Vite SPA, react-router
  version-1.0.0/  This briefing
```

The browser never talks to the database. The Vite dev server proxies `/api` to
`http://localhost:3001`, so everything is same-origin: no CORS preflight, and auth
headers stay same-site.

| Layer     | Choice                                                       |
| --------- | ------------------------------------------------------------ |
| Front end | React 19, Vite, react-router 7, plain CSS                      |
| API       | Node 22+, Express 5, ES modules                               |
| Database  | PostgreSQL (hosted Supabase Postgres) via `pg`                |
| Auth      | Supabase session verification, or `AUTH_MODE=dev` locally     |

### API surface

All routes except `/api/health` sit behind session verification.

| Method   | Path                | Purpose                                  |
| -------- | ------------------- | ---------------------------------------- |
| `GET`    | `/api/health`       | Liveness plus a real `select 1` to the DB |
| `GET`    | `/api/members`      | List with `search`, `gender`, `marital_status`, `title`, `sort`, `direction` |
| `GET`    | `/api/members/:id`  | One member                              |
| `POST`   | `/api/members`      | Create                                  |
| `PATCH`  | `/api/members/:id`  | Partial update                          |
| `DELETE` | `/api/members/:id`  | Delete (204)                            |

`GET /api/members` returns `{ members, total, totalAll }`: the rows, how many
matched the filters, and how many exist unfiltered — that is what the
"n of m members on record" header renders.

## Running it

Prerequisites: Node 22 or newer, and a PostgreSQL database with the schema applied.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit .env
npm run dev               # http://localhost:3001
```

`.env` needs at minimum:

```ini
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=no-verify
AUTH_MODE=dev
PORT=3001
```

For a hosted Supabase project, use the **session** pooler connection string from
the dashboard, not the direct host — `.env.example` explains why in detail. Also
set `SUPABASE_URL` and `SUPABASE_ANON_KEY` if you want real authentication; the
service role key is never needed here, because this app talks to Postgres
directly rather than through the PostgREST Data API.

Confirm the server is up:

```bash
curl http://localhost:3001/api/health     # -> {"ok":true}
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (default <http://localhost:5173>). The dev server
proxies `/api` to port 3001, so nothing else needs configuring.

### 3. Tests

```bash
cd backend  && npm test        # node --test
cd frontend && npm test        # vitest run
cd frontend && npm run lint    # eslint
```

The backend tests run against a real database, because most of what is worth
testing here is how the code talks to Postgres — enum drift, sort stability,
`nulls last` ordering, transaction rollback. If the database is unreachable or
unmigrated they skip with a reason rather than failing obscurely, so always read
the skip message before assuming a green run covered anything.

## MVP scope

**In:** the member directory, filtering, sorting, full CRUD, session-gated API.

**Out, for now:** member photos are stored as a `photo_url` string and nothing
uploads yet; no pagination (the API returns every matching row, which is fine at
MVP data volumes and will need a limit/offset before it is not); no audit trail
or soft deletes; no member self-service or roles — every authenticated user can
read and write every record, and authorization is the next thing to build; no
deployment pipeline, CI, or migrations checked into the repo.

## Two things to know before you touch a real database

1. **`AUTH_MODE=dev` disables authentication.** The server refuses to start with
   it under `NODE_ENV=production`, but in development it treats every request as
   an authenticated user. Never point it at real member data.
2. **Row Level Security is enabled with no policies.** The API holds the only key
   that can read `members`; the `anon` role is blocked at the database, not in
   application code. If you add a client that talks to Supabase directly, you are
   adding a second door.
