#!/bin/sh
#
# Confirms an exported .p12 is usable for signing — that is, that it
# actually contains a private key.
#
# Keychain Access will happily export a certificate on its own, and the
# result looks fine: right extension, plausible size, imports without
# complaint. It only fails later, in CI, as an unsigned build rather than
# an error. This catches it in a second.
#
#   ./scripts/check-signing-cert.sh markdiff-signing.p12

set -eu

P12=${1:-}
if [ -z "$P12" ] || [ ! -f "$P12" ]; then
  echo "usage: $0 <certificate.p12>" >&2
  exit 2
fi

printf 'Password for %s: ' "$(basename "$P12")" >&2
stty -echo 2>/dev/null || true
read -r PASSWORD
stty echo 2>/dev/null || true
echo >&2

dump=$(openssl pkcs12 -in "$P12" -nodes -passin "pass:$PASSWORD" 2>/dev/null) || {
  echo "✗ Could not read it — wrong password, or not a PKCS#12 file." >&2
  exit 1
}

keys=$(printf '%s' "$dump" | grep -c 'BEGIN PRIVATE KEY\|BEGIN ENCRYPTED PRIVATE KEY\|BEGIN RSA PRIVATE KEY' || true)
if [ "$keys" -eq 0 ]; then
  echo "✗ No private key inside." >&2
  echo "  Exported from the 'Certificates' category instead of" >&2
  echo "  'My Certificates'. Re-export the identity, not the certificate." >&2
  exit 1
fi

echo "✓ Contains a private key ($keys)."
printf '%s' "$dump" | grep -m1 'friendlyName' | sed 's/^ *//' || true
printf '%s' "$dump" | openssl x509 -noout -subject -enddate 2>/dev/null || true
echo
echo "Set it with:"
echo "  base64 -i $P12 | gh secret set APPLE_CERTIFICATE --repo squirrelsoft-dev/markdiff"
