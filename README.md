# PlanApp

A project planning app built around **sequence cards** on a spatial canvas. Organize
work into projects, arrange sequences into layers, connect them with edges, and track
todos inside each card.

Node/Express + MySQL on the back end, React on the front end.

## Features

- **Auth** — register/login with bcrypt-hashed passwords and JWT bearer tokens
- **Projects** — per-user projects with an ownership-checked API
- **Canvas** — drag-and-drop sequence cards across layers, with connector edges
- **Todos** — add, reorder, complete, and move todos between sequence cards
- **Frontier view** — surfaces the next actionable work across projects
- **Calendar** — a strip of 24-hour day columns beside a pool of every project's
  startable to-dos; add and delete days, drag a to-do into a day or between days,
  resize a booking by its top or bottom edge, drop it back on the pool to
  unschedule it, and open the sequence a booking came from on the project page

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Create React App), React Router v6 |
| Backend | Express 4, JWT, Zod validation |
| Database | MySQL 8 (mysql2, promise pool) |
| Testing | Jest + Supertest (unit/integration), Playwright (E2E) |

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8

### Setup

```bash
git clone https://github.com/shinjsjustin/PlanApp.git
cd PlanApp

npm install
npm install --prefix src/client
```

Create the database and load the schema:

```bash
mysql -u <user> -p -e "CREATE DATABASE planapp;"
mysql -u <user> -p planapp < src/db/schema.sql
```

Copy the env templates and fill them in:

```bash
cp .env.example .env
cp src/client/.env.example src/client/.env
```

Generate the required secrets:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY (64-char hex = AES-256 key)
```

The server refuses to start if `JWT_SECRET` is missing, rather than falling back to a
default that would be no secret at all.

### Run

```bash
npm run dev      # server (:3001) + client (:3000) together
npm start        # server only
npm run client   # client only
```

## Testing

```bash
npm test           # server unit + integration (Jest)
npm run test:client # React component tests
npm run test:e2e   # Playwright end-to-end (uses DB planapp_test)
npm run test:all   # everything
```

E2E tests run against a separate `planapp_test` database — create it and load
`src/db/schema.sql` into it the same way as above.

## Project Structure

```
src/
├── server.js          # Express entry point
├── db/                # MySQL pool, schema, repositories, unit of work
├── lib/               # Validation, error helpers, serializers, frontier logic
├── middleware/        # JWT auth guard
├── routes/            # auth, user, projects, sequences, layers, todos, calendar
└── client/            # React app
tests/
├── unit/              # Pure logic
├── integration/       # API routes + repositories (Supertest)
└── e2e/               # Playwright user flows
```

See [AGENTS.md](AGENTS.md) for a deeper architecture guide and conventions.

## License

MIT
