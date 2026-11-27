#!/bin/sh
# run-tests.sh — run the custom-budget test suite (plain Node, no extra deps).
#   1. node build-patch.js config.example.yml (build the patch from the
#      template + demo config; the patch itself is generated, not committed).
#   2. node --check on the generated patch (syntax).
#   3. node tests/test-tweaks.js (fake-DOM harness: Budget page scenarios,
#      Uncategorized transfer-row hiding, and the demo-figure reconciliation).
#   4. node tests/test-build.js (the build step: a valid config builds;
#      a config that does not reconcile is rejected).
# Usage: ./tests/run-tests.sh   (from custom-budget/) or   sh tests/run-tests.sh
set -eu
cd "$(dirname "$0")/.."
echo "== node build-patch.js config.example.yml =="
node build-patch.js config.example.yml
echo "== node --check actual-budget-tweaks.js =="
node --check actual-budget-tweaks.js && echo SYNTAX_OK
echo "== node tests/test-tweaks.js =="
node tests/test-tweaks.js
echo "== node tests/test-build.js =="
node tests/test-build.js
echo "== all checks passed =="
