#!/bin/sh
# install-tweaks.sh — install custom-budget/actual-budget-tweaks.js into a
# self-hosted Actual Budget server's served web bundle, and verify it.
# The patch is GENERATED from the template + config (see README.md):
#   1. Build it from config.yml (or config.example.yml if config.yml is
#      absent) with build-patch.js — this validates the config and writes
#      actual-budget-tweaks.js. The build fails loudly if the config is
#      missing or its figures do not reconcile.
#   2. Back up the web build directory (dated backup; never delete it).
#   3. Copy actual-budget-tweaks.js into the build directory.
#   4. Add one <script src="/actual-budget-tweaks.js"></script> line to
#      build/index.html (before </body>), if it is not already there.
#   5. Verify: node --check, the tag appears exactly once, the JS is
#      served over HTTP, and no known-bad strings are present.
#
# Setup: copy config.example.yml to config.yml, fill in your figures
# (net worth, buckets, monthly income/spending, goals, home value,
# account names) and your install settings, then run this script.
# BUILD_DIR / SERVER_URL can also be given as env vars; they override the
# config's install settings. All values in config.example.yml are
# placeholders, not real data.
#
# Hard rules (see docs/AGENTIC-OPERATING-GUIDE.md):
#   - NEVER run npm install or the community-scripts updater on the live
#     server — it reinstalls Actual and wipes this patch (and the API keys).
#   - NEVER delete or overwrite the pristine backup.
#   - No server restart is needed: the web bundle is served as static files.
#   - After installing, hard-refresh the browser (Cmd/Ctrl+Shift+R).
#
# Usage (on the server that hosts Actual):
#   ./install-tweaks.sh
#   # or with env-var overrides:
#   BUILD_DIR=/path/to/actual-app/web/build \
#   SERVER_URL=https://example.com:5006 \
#   ./install-tweaks.sh
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
PATCH="actual-budget-tweaks.js"
TAG='<script src="/actual-budget-tweaks.js"></script>'

# 0. Pick the config: your own config.yml, else the demo config.example.yml.
if [ -f "$DIR/config.yml" ]; then
  CONFIG="$DIR/config.yml"
elif [ -f "$DIR/config.example.yml" ]; then
  CONFIG="$DIR/config.example.yml"
  echo "NOTE: no config.yml found — building from the demo config.example.yml."
  echo "      Copy config.example.yml to config.yml and fill in your figures"
  echo "      to install your own customization."
else
  echo "ABORT: no config found — neither $DIR/config.yml nor $DIR/config.example.yml exists." >&2
  echo "       Copy config.example.yml to config.yml and fill in your figures." >&2
  exit 1
fi

# 0b. Build the patch from the template + config. Fails loudly if the
#     config is invalid or its figures do not reconcile.
echo "building the patch from $CONFIG ..."
node "$DIR/build-patch.js" "$CONFIG"
SRC="$DIR/$PATCH"

# 0c. Install settings: env vars win; otherwise read them from the config.
if [ -n "${BUILD_DIR:-}" ]; then
  : # keep the env var
else
  BUILD_DIR="$(node "$DIR/build-patch.js" --print "$CONFIG" install.build_dir)"
fi
if [ -n "${SERVER_URL:-}" ]; then
  : # keep the env var
else
  SERVER_URL="$(node "$DIR/build-patch.js" --print "$CONFIG" install.server_url)"
fi
if [ -z "$BUILD_DIR" ]; then
  echo "ABORT: no build dir — set BUILD_DIR or install.build_dir in $CONFIG." >&2
  exit 1
fi
if [ -z "$SERVER_URL" ]; then
  echo "ABORT: no server URL — set SERVER_URL or install.server_url in $CONFIG." >&2
  exit 1
fi

echo "build dir: $BUILD_DIR"
echo "server:    $SERVER_URL"
echo "source:    $SRC"

if [ ! -f "$SRC" ]; then
  echo "ABORT: $SRC not found (the build step should have written it)." >&2
  exit 1
fi
if [ ! -d "$BUILD_DIR" ]; then
  echo "ABORT: build dir $BUILD_DIR not found — set BUILD_DIR to your Actual web build directory." >&2
  exit 1
fi

# 1. Pristine backup (dated; never delete it).
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${BUILD_DIR}.bak-${STAMP}-actual-ui-patch"
if [ ! -d "$BACKUP" ]; then
  cp -a "$BUILD_DIR" "$BACKUP"
  echo "backup created: $BACKUP"
else
  echo "backup already exists: $BACKUP"
fi

# 2. Copy the patch in.
cp "$SRC" "$BUILD_DIR/$PATCH"
echo "installed bytes:"; wc -c < "$BUILD_DIR/$PATCH"
if [ "$(wc -c < "$BUILD_DIR/$PATCH")" -lt 1000 ]; then
  echo "ABORT: patch suspiciously small." >&2
  exit 1
fi

# 3. Script tag in index.html (idempotent).
if grep -q "actual-budget-tweaks.js" "$BUILD_DIR/index.html"; then
  echo "script tag already present in index.html (no change)"
else
  if ! grep -q "</body>" "$BUILD_DIR/index.html"; then
    echo "ABORT: index.html has no </body>." >&2
    exit 1
  fi
  # Insert the tag before </body> (first occurrence).
  tmp="$(mktemp)"
  awk -v tag="$TAG" '{ if (!done && index($0, "</body>")) { sub("</body>", tag "</body>"); done=1 } print }' \
    "$BUILD_DIR/index.html" > "$tmp"
  mv "$tmp" "$BUILD_DIR/index.html"
  echo "script tag inserted into index.html"
fi

# 4. Verify.
echo "node --check:"; node --check "$BUILD_DIR/$PATCH" && echo SYNTAX_OK
echo "script tag count in index.html (expect 1):"; grep -c "actual-budget-tweaks.js" "$BUILD_DIR/index.html"
echo "known-bad strings (expect 0 each):"
echo "  'Spent in October':"; grep -c "Spent in October" "$BUILD_DIR/$PATCH" || true
echo "  'Available funds':"; grep -c "Available funds" "$BUILD_DIR/$PATCH" || true
echo "  'Saved in the year':"; grep -c "Saved in the year" "$BUILD_DIR/$PATCH" || true
echo "HTTP check (expect 200):"
curl -k -s -o /dev/null -w "%{http_code} %{size_download}\n" "$SERVER_URL/$PATCH"
echo "DONE. Hard-refresh the browser (Cmd/Ctrl+Shift+R) and check the Budget page."
