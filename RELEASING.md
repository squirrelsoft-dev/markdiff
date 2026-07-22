# Releasing

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml)
on every `v*` tag, for macOS (universal), Linux (x86_64) and Windows
(x86_64). The workflow uploads to a **draft** release, so nothing is
public until you look at the artifacts and press publish.

## Cutting a release

1. Update `CHANGELOG.md` — move `Unreleased` into a version heading.
2. Bump the version in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json`. All three must agree; `tauri.conf.json`
   is the one that names the artifacts.
3. Commit, then tag and push:

   ```sh
   git tag -a v0.1.0 -m "markdiff 0.1.0"
   git push origin v0.1.0
   ```

4. Wait for the workflow, check the draft release, publish it.

`workflow_dispatch` will rebuild an existing tag if a run needs repeating.

## macOS signing and notarisation

Without these secrets the macOS build still succeeds, but it is unsigned:
Gatekeeper will refuse to open it, and "right click → Open" no longer
works around that on current macOS. Six secrets are needed.

You need a **Developer ID Application** certificate — not "Apple
Development", which only works on machines registered to your account.

### Export the certificate

Keychain Access → **My Certificates** → find
`Developer ID Application: SquirrelSoft LLC (…)` → right-click →
**Export** → `.p12`, and set a password when prompted. That password
becomes `APPLE_CERTIFICATE_PASSWORD`.

Confirm you have the right kind first:

```sh
security find-identity -v -p codesigning | grep "Developer ID Application"
```

### Set the secrets

```sh
REPO=squirrelsoft-dev/markdiff

# The certificate, base64 encoded.
base64 -i markdiff-signing.p12 | gh secret set APPLE_CERTIFICATE --repo $REPO

# The password you chose during export (prompts, nothing is echoed).
gh secret set APPLE_CERTIFICATE_PASSWORD --repo $REPO

# Exactly as `security find-identity` prints it, parentheses included.
printf %s 'Developer ID Application: SquirrelSoft LLC (TEAMID)' |
  gh secret set APPLE_SIGNING_IDENTITY --repo $REPO

# For notarisation.
printf %s 'you@example.com' | gh secret set APPLE_ID      --repo $REPO
printf %s 'TEAMID'          | gh secret set APPLE_TEAM_ID --repo $REPO
gh secret set APPLE_PASSWORD --repo $REPO   # app-specific password
```

`printf %s` rather than `echo`: a trailing newline in a secret is
invisible in the UI and breaks the signing identity match in a way that
is genuinely annoying to diagnose.

Delete the `.p12` once the secret is set — it is your signing key.

### The app-specific password

`APPLE_PASSWORD` is **not** your Apple ID password. Generate one at
[appleid.apple.com](https://appleid.apple.com) → Sign-In and Security →
App-Specific Passwords.

Alternatively, use an App Store Connect API key, which does not expire
with your password and is the better option if this ever runs unattended.
Set `APPLE_API_ISSUER`, `APPLE_API_KEY` and `APPLE_API_KEY_PATH` instead
of the three `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` secrets, and add
them to the workflow's `env` block.

### Checking it worked

Notarisation happens during the build and takes a few minutes; the
workflow log shows it. On the downloaded artifact:

```sh
spctl -a -vvv -t install /Applications/markdiff.app
codesign -dv --verbose=4 /Applications/markdiff.app
xcrun stapler validate /Applications/markdiff.app
```

`spctl` should say `accepted` and `source=Notarized Developer ID`.

## Windows and Linux

Both ship unsigned. Windows SmartScreen will warn on first run until the
download builds reputation, or until an EV code-signing certificate is
bought and wired in with `WINDOWS_CERTIFICATE` /
`WINDOWS_CERTIFICATE_PASSWORD`. Linux packages are not signed by
convention outside distribution repositories.

## Versioning

Semantic versioning. While the version is `0.x`, a minor bump may break
things; that is what `0.x` means.
