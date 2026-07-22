#!/bin/sh
#
# Puts the `markdiff` launcher on PATH.
#
#   ./scripts/install-cli.sh              # into the first writable default
#   ./scripts/install-cli.sh ~/bin        # into a directory you choose

set -eu

SOURCE=$(cd "$(dirname "$0")" && pwd)/markdiff

# /usr/local/bin first: it is the one directory `/etc/paths` ships, so it
# is on PATH for every account with no shell-profile editing. Homebrew's
# own prefix is deliberately not a candidate — that namespace is its to
# manage, and `brew doctor` reports foreign files there.
if [ $# -gt 0 ]; then
  TARGET_DIR=$1
else
  TARGET_DIR=
  for candidate in /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
    if [ -d "$candidate" ] && [ -w "$candidate" ]; then
      TARGET_DIR=$candidate
      break
    fi
  done
  if [ -z "$TARGET_DIR" ]; then
    echo "No writable directory found on PATH. Either:" >&2
    echo "  sudo ./scripts/install-cli.sh /usr/local/bin" >&2
    echo "  ./scripts/install-cli.sh <a directory on your PATH>" >&2
    exit 1
  fi
fi

install -m 755 "$SOURCE" "$TARGET_DIR/markdiff"
echo "Installed $TARGET_DIR/markdiff"

case ":$PATH:" in
  *":$TARGET_DIR:"*) ;;
  *) echo "Note: $TARGET_DIR is not on your PATH — add it to use \`markdiff\`." >&2 ;;
esac
