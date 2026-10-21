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
  startable to-dos. Each column is split in two: to-dos on the right, where a
  booking can be dragged in from the pool, moved between days, resized by either
  edge, and dropped back on the pool to unschedule it; and **notes** on the left,
  free-floating blocks of context that never move the work. Click a time to add a
  30-minute note or drag across a range to fit one, up to four overlapping at
  once. Columns fill the page and are sized so two days read comfortably side by
  side, with a third reachable by scrolling.

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
npm run test:visual # screenshots and layout checks (see Visual suite)
npm run test:all   # everything
```

E2E tests run against a separate `planapp_test` database — create it and load
`src/db/schema.sql` into it the same way as above.

## Visual suite

Screenshots and layout checks of every page. It is not part of `npm run test:all`
or CI.

One-time setup:

```bash
npx playwright install webkit      # the iphone size uses WebKit
npm install --prefix src/client    # axe-core comes from the client install
```

Local run: `npm run test:visual` builds the client, serves it on port 3102 and
seeds `visual@example.test` into `planapp_test`.

Live run: set `VISUAL_BASE_URL` and `VISUAL_TOKEN` (a JWT, taken from the
environment and never committed). `VISUAL_API_URL` is optional and defaults to
`$VISUAL_BASE_URL/api`.

```bash
VISUAL_BASE_URL=https://shinplan.com VISUAL_TOKEN=<jwt> npm run test:visual
```

Live runs only read: non-GET API calls are blocked. They visit every project and
its thoughts page.

Sizes:

- `desktop-1440`: 1440 x 900
- `laptop-1036`: 1036 x 800
- `iphone`: 393 x 852, WebKit

Checks on each page:

- no horizontal overflow
- axe-core: contrast, labels, button, link and select names
- no clipped text
- nothing hidden under fixed bars
- no starter-template text

Screenshots land in `visual-screenshots/<size>/`. Run one size with
`npx playwright test -c playwright.visual.config.js --project iphone`.

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
