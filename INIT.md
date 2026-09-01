# INIT.md — Automated Project Setup

**Audience: AI agent (Claude Code, Copilot, etc.).** The user just unzipped this
template as a new project. Your job is to collect three values, run `init.sh`,
verify the result, and clean up. Do not improvise extra steps.

## Step 1 — Ask the user for exactly three values

| Value | Rules | Used for |
|-------|-------|----------|
| Project name | `^[A-Za-z0-9][A-Za-z0-9._-]*$` — no spaces | Folder name, browser title, web manifest, AGENTS.md tree |
| Database name | `^[A-Za-z][A-Za-z0-9_]*$` | `DB_NAME` in `.env` (the database is **not** created for them) |
| Server port | Integer 1–65535, suggest `3001` | Server `.env` PORT, client `.env` REACT_APP_URL, CRA proxy |

Validate before proceeding; re-ask if a value breaks the rules.
Also ask: "MySQL user/host is root@localhost — correct?"

## Step 2 — Run the script

```bash
./init.sh --name <ProjectName> --db <db_name> --port <port>
```

- Non-default MySQL: append `--db-user <u>` / `--db-host <h>`.
- **Never ask for the MySQL password in chat.** The password is only written to
  `.env`; if the user has one, tell them to run the same `./init.sh` command
  themselves in a terminal — it prompts with hidden input. Otherwise pass
  `--db-pass ""` and tell them to fill `DB_PASSWORD` in `.env` afterwards.
- **The script never touches MySQL.** It creates no database and no tables — it
  prints the SQL for the user to run (see Step 4).
- Other escape hatches: `--skip-install`, `--skip-rename`, `--help`.

The script (in order): backs up any existing `.env` → writes server `.env`
(port, DB creds, fresh random JWT_SECRET / SESSION_SECRET / ENCRYPTION_KEY) →
writes client `.env` + CRA proxy → stamps the project name into
`manifest.json`, `index.html` title, and the AGENTS.md directory tree →
`npm install` (root + client) → **renames** the project folder to the project
name **last**, then prints the database SQL the user still has to run.

## Step 3 — Move to the new path immediately

The folder is *renamed*, not copied: `Template/` becomes `<ProjectName>/` and
the old path stops existing. But your shell still has the old path as its
working directory, and running anything there **recreates an empty `Template/`
folder** — that is where the stray second folder comes from.

So, as the very first command after `init.sh`:

```bash
cd /absolute/path/to/<ProjectName>          # parent dir + project name
rmdir /absolute/path/to/Template 2>/dev/null || true   # drop any empty leftover
```

Use absolute paths under the new folder for every command from here on. Never
`cd` back to the old `Template` path. Before reporting, confirm exactly one
folder exists:

```bash
ls -d /absolute/path/to/<ProjectName> /absolute/path/to/Template 2>&1
```

`<ProjectName>` must exist and `Template` must be gone.

## Step 4 — Verify (without printing secrets into chat)

```bash
grep -E '^(PORT|DB_HOST|DB_USER|DB_NAME)=' .env        # expected values
grep -c 'TODO_replace' .env                             # must print 0
grep '^REACT_APP_URL=' src/client/.env                  # has the chosen port
grep 'short_name' src/client/public/manifest.json       # project name
head -c 200 AGENTS.md | grep -A2 '^```'                 # tree root renamed
```

## Step 5 — Report and clean up

Tell the user:
1. What was set up (name, db name, port) and anything skipped.
2. **The database still has to be created by them.** Repeat the SQL that
   `init.sh` printed — `CREATE DATABASE IF NOT EXISTS <db>;`, `USE <db>;`, and
   the `CREATE TABLE admin (...)` block from `src/db/schema.sql` — plus the
   shortcut `mysql -u <user> -p <db> < src/db/schema.sql` once the database
   exists. The app will not start against a missing database.
3. Other manual items: `DB_PASSWORD` in `.env` if they have one,
   `ANTHROPIC_API_KEY` in `.env` (only if used), branding TODOs in AGENTS.md.
4. The folder was renamed — reopen the editor / Claude Code at the new path.
5. Start with `npm run dev` (dev) or `./deploy_local.sh` (prod-style).

Then ask whether to delete the one-time init files: `INIT.md`, `init.sh`,
`Init.txt`, and any `.env.bak.*` backup. Delete only after the user confirms.
