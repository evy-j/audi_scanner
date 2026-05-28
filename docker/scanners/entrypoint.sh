#!/usr/bin/env sh
set -eu

umask "${SCANNER_UMASK:-022}"

if [ ! -d /workspace ]; then
  echo "scanner sandbox missing /workspace mount" >&2
  exit 126
fi

if [ ! -d /output ]; then
  echo "scanner sandbox missing /output mount" >&2
  exit 126
fi

if [ ! -w /output ]; then
  echo "scanner sandbox cannot write to /output" >&2
  exit 126
fi

export HOME="${HOME:-/tmp}"
export TMPDIR="${TMPDIR:-/tmp}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/.cache}"

mkdir -p "$XDG_CACHE_HOME" /tmp/scanner
cd /workspace

exec "$@"
