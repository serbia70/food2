#!/bin/bash
# Minimal static check to prevent hardcoded secrets in VPS scripts.
# This script itself must not contain real secrets.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILES=(
  "$ROOT_DIR/vps-deploy.sh"
  "$ROOT_DIR/use-prod-db.sh"
  "$ROOT_DIR/fix-token-and-service.sh"
)

fail=0

# 1) Must not contain specific keys assigned to a literal value
#    Allow: variable interpolation ($MEITUAN_...), placeholder string "replace-with-long-random-value"
#    Disallow: MEITUAN_XXX=<non-placeholder literal>
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌ missing file: $f" >&2
    exit 1
  fi

  while IFS= read -r line; do
    case "$line" in
      MEITUAN_MASTER_TOKEN=*|MEITUAN_JWT_SECRET=*|MEITUAN_SUPER_PASSWORD=*)
        # Extract value (strip key=)
        val="${line#*=}"

        # Allow empty (but scripts should require env at runtime) and allow interpolation and known placeholder.
        if [[ "$val" == "" ]]; then
          continue
        fi
        if [[ "$val" == *"$"* ]]; then
          continue
        fi
        if [[ "$val" == "replace-with-long-random-value" ]]; then
          continue
        fi

        key="${line%%=*}"
        echo "❌ hardcoded secret value detected in $f for $key" >&2
        fail=1
        ;;
    esac
  done < <(grep -E '^(MEITUAN_MASTER_TOKEN|MEITUAN_JWT_SECRET|MEITUAN_SUPER_PASSWORD)=' "$f" || true)

done

# 2) Must not contain known leaked example strings (avoid printing them)
# NOTE: keep these as *patterns* and do not include any real secrets.
if grep -R -n -E 'aaf[0-9a-f]{30,}|e2fa[0-9a-f]{8,}|4b3a[0-9a-f]{6,}' "${FILES[@]}" >/dev/null 2>&1; then
  echo "❌ known leaked-like token pattern found in scripts" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "❌ static check failed" >&2
  exit 1
fi

# If running inside a git repo, ensure the checked files are tracked.
# This avoids a false sense of safety when scripts are untracked.
if command -v git >/dev/null 2>&1; then
  if git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    for f in "${FILES[@]}"; do
      rel="${f#$ROOT_DIR/}"
      if ! git -C "$ROOT_DIR" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
        echo "❌ file is not tracked by git: $rel" >&2
        exit 1
      fi
    done
  fi
fi

echo "✅ static check passed"