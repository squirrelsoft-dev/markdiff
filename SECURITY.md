# Security Policy

## Supported versions

markdiff is pre-1.0. Fixes go onto the latest release only.

## Reporting a vulnerability

Please report privately rather than opening a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/squirrelsoft-dev/markdiff/security/advisories/new),
which goes straight to the maintainers.

Include what you did, what happened, and what you expected. A sample pair
of markdown files that triggers the problem is the most useful thing you
can attach.

You should get an acknowledgement within a week.

## Scope

markdiff is a local desktop application. It reads and writes files you
point it at, and makes no network requests of its own. The areas most
worth scrutiny:

- **Rendered markdown.** The overlay views render documents the app did
  not write. Output is sanitised with DOMPurify before it reaches the
  DOM, with a narrow tag and attribute allowlist. A way to get script
  execution out of a markdown file is a genuine vulnerability — please
  report it.
- **Links in rendered documents.** These are handed to the OS rather than
  navigating the app's own webview, and only `http(s)` URLs are opened.
- **Saving.** Writes go to a temporary file and are renamed over the
  target, preserving the original permissions.
- **The CLI install.** This creates a symlink in a directory on your
  PATH, and will not overwrite a file it did not create. The elevated
  variant runs a `ln` command through the macOS authorization prompt; the
  paths in it are shell-quoted and AppleScript-escaped.

Out of scope: the app can read and write any file the user running it can
read and write. That is what a diff tool does.
