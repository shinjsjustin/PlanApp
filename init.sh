#!/bin/bash
# init.sh — one-shot initializer for a fresh copy of this web app template.
#
# Applies the project name, database name, and server port everywhere they
# matter: .env files (with fresh random secrets), client manifest/title,
# AGENTS.md directory tree, npm installs, and finally renames this folder to
# the project name.
#
# It does NOT touch MySQL. At the end it prints the SQL you need to run
# yourself to create the database and the admin table.
#
# Run ./init.sh --help for usage.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

die() { echo "ERROR: $1" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./init.sh --name <ProjectName> --db <db_name> --port <port> [options]

Required (prompted for when omitted and run in an interactive terminal):
  --name <name>    Project name -> folder name, browser title, web manifest.
                   Allowed: letters, digits, dot, dash, underscore. No spaces.
  --db <name>      MySQL database name written to .env. Letters, digits,
                   underscore. The database itself is NOT created — the script
                   prints the SQL for you to run.
  --port <port>    Express server port (1-65535), e.g. 3001.

Options:
  --db-user <u>    MySQL user written to .env             [default: root]
  --db-host <h>    MySQL host written to .env             [default: localhost]
  --db-pass <p>    MySQL password written to .env. Omitted -> prompted (hidden
                   input) in an interactive terminal, or treated as empty.
  --skip-install   Skip npm installs
  --skip-rename    Skip renaming the project folder
  -h, --help       Show this help
EOF
}

# In-place sed that works with both BSD (macOS) and GNU sed.
sedi() { if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi; }

# Escape a value for use in a sed replacement (| is the delimiter).
esc() { printf '%s' "$1" | sed -e 's/[|\\&]/\\&/g'; }

PROJECT_NAME=""; DB_NAME=""; PORT=""
DB_USER="root"; DB_HOST="localhost"; DB_PASSWORD=""; DB_PASS_SET=false
SKIP_INSTALL=false; SKIP_RENAME=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name|--db|--port|--db-user|--db-host|--db-pass)
      [[ $# -ge 2 ]] || die "Missing value for $1"
      case "$1" in
        --name)    PROJECT_NAME="$2" ;;
        --db)      DB_NAME="$2" ;;
        --port)    PORT="$2" ;;
        --db-user) DB_USER="$2" ;;
        --db-host) DB_HOST="$2" ;;
        --db-pass) DB_PASSWORD="$2"; DB_PASS_SET=true ;;
      esac
      shift 2 ;;
    --skip-install) SKIP_INSTALL=true; shift ;;
    --skip-rename)  SKIP_RENAME=true; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              usage; die "Unknown option: $1" ;;
  esac
done

# ── Gather + validate inputs ─────────────────────────────────────────────────
if [[ -t 0 ]]; then
  if [[ -z "$PROJECT_NAME" ]]; then printf "Project name: "; read -r PROJECT_NAME; fi
  if [[ -z "$DB_NAME"      ]]; then printf "Database name: "; read -r DB_NAME; fi
  if [[ -z "$PORT"         ]]; then printf "Server port [3001]: "; read -r PORT; PORT="${PORT:-3001}"; fi
fi

[[ -n "$PROJECT_NAME" ]] || die "Project name is required (--name)"
[[ -n "$DB_NAME"      ]] || die "Database name is required (--db)"
[[ -n "$PORT"         ]] || die "Port is required (--port)"

[[ "$PROJECT_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
  || die "Invalid project name '$PROJECT_NAME' (letters, digits, . _ - only; no spaces)"
[[ "$DB_NAME" =~ ^[A-Za-z][A-Za-z0-9_]*$ ]] \
  || die "Invalid database name '$DB_NAME' (letters, digits, _ only; must start with a letter)"
[[ "$PORT" =~ ^[0-9]+$ ]] && [[ "$PORT" -ge 1 && "$PORT" -le 65535 ]] \
  || die "Invalid port '$PORT' (must be 1-65535)"

command -v openssl >/dev/null 2>&1 || die "openssl not found (needed to generate secrets)"
[[ -f .env.example ]] || die "Run this from the template root (.env.example not found)"
[[ -f src/db/schema.sql ]] || die "src/db/schema.sql not found"

if [[ "$DB_PASS_SET" == false && -t 0 ]]; then
  printf "MySQL password for %s@%s (hidden, Enter if none): " "$DB_USER" "$DB_HOST"
  read -rs DB_PASSWORD || true
  echo
fi

# Capture the schema now, so the reminder still prints after the folder rename.
SCHEMA_SQL="$(cat src/db/schema.sql)"

# ── Server .env: DB settings, port, fresh secrets ────────────────────────────
echo "→ Writing server .env"
if [[ -f .env ]]; then
  cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
  echo "  (existing .env backed up)"
fi
JWT_SECRET="$(openssl rand -hex 32)"
SESSION_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"
cp .env.example .env
sedi \
  -e "s|^PORT=.*|PORT=$PORT|" \
  -e "s|^DB_HOST=.*|DB_HOST=$(esc "$DB_HOST")|" \
  -e "s|^DB_USER=.*|DB_USER=$(esc "$DB_USER")|" \
  -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(esc "$DB_PASSWORD")|" \
  -e "s|^DB_NAME=.*|DB_NAME=$DB_NAME|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" \
  -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" \
  -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENCRYPTION_KEY|" \
  .env

# ── Client .env + CRA dev proxy ──────────────────────────────────────────────
echo "→ Writing client .env"
cp src/client/.env.example src/client/.env
sedi "s|^REACT_APP_URL=.*|REACT_APP_URL=http://localhost:$PORT/api|" src/client/.env
sedi "s|\"proxy\": \"http://localhost:[0-9]*\"|\"proxy\": \"http://localhost:$PORT\"|" src/client/package.json

# ── Stamp project name into manifest, title, AGENTS.md ───────────────────────
echo "→ Stamping project name"
NAME_ESC="$(esc "$PROJECT_NAME")"
sedi "s|Web App Template|$NAME_ESC|g" src/client/public/manifest.json
sedi \
  -e "s|<title>.*</title>|<title>$NAME_ESC</title>|" \
  -e "s|content=\"Shop template\"|content=\"$NAME_ESC\"|" \
  src/client/public/index.html
sedi "s|^Template/|$NAME_ESC/|" AGENTS.md

# ── Dependencies ─────────────────────────────────────────────────────────────
if [[ "$SKIP_INSTALL" == false ]]; then
  echo "→ Installing server dependencies"
  npm install
  echo "→ Installing client dependencies"
  npm install --prefix src/client
else
  echo "→ Skipping npm installs (--skip-install)"
fi

# ── Rename this folder in place (must be the last file operation) ────────────
# `mv` renames the existing directory — it never copies. Nothing is left behind
# at the old path; if an empty folder reappears there it was recreated by a
# tool still holding the old path as its working directory (see INIT.md).
FINAL_DIR="$SCRIPT_DIR"
if [[ "$SKIP_RENAME" == false ]]; then
  PARENT_DIR="$(dirname "$SCRIPT_DIR")"
  NEW_DIR="$PARENT_DIR/$PROJECT_NAME"
  if [[ "$SCRIPT_DIR" == "$NEW_DIR" ]]; then
    echo "→ Folder already named '$PROJECT_NAME'"
  elif [[ -e "$NEW_DIR" ]]; then
    echo "WARNING: $NEW_DIR already exists — folder NOT renamed" >&2
  else
    mv "$SCRIPT_DIR" "$NEW_DIR"
    FINAL_DIR="$NEW_DIR"
    echo "→ Folder renamed to '$PROJECT_NAME'"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
cat <<EOF

────────────────────────────────────────────────────
  ✓ '$PROJECT_NAME' initialized
────────────────────────────────────────────────────
  Server .env    PORT=$PORT, DB_NAME=$DB_NAME, fresh JWT/SESSION/ENCRYPTION secrets
  Client .env    REACT_APP_URL=http://localhost:$PORT/api
  Project folder $FINAL_DIR (renamed in place — the old path is gone)

  ⚠ Database NOT created. Do this yourself before starting the app:

    mysql -u $DB_USER -h $DB_HOST -p

EOF

# Printed outside the heredoc: the SQL contains backticks.
printf '      CREATE DATABASE IF NOT EXISTS `%s`;\n' "$DB_NAME"
printf '      USE `%s`;\n' "$DB_NAME"
printf '%s\n' "$SCHEMA_SQL" | sed 's/^/      /'

cat <<EOF

  (Same statements live in src/db/schema.sql, so you can also run:
     mysql -u $DB_USER -h $DB_HOST -p $DB_NAME < src/db/schema.sql
   after creating the database.)

  Still manual:
  - The database + admin table above
  - ANTHROPIC_API_KEY in .env (only if this project uses it)
  - Branding TODOs listed in AGENTS.md

  Run it:
    cd "$FINAL_DIR"
    npm run dev          # dev: server :$PORT + client :3000
    ./deploy_local.sh    # prod-style: build client, serve from Express
EOF
