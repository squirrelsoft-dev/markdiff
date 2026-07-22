import { useCallback, useEffect, useState } from "react";

import {
  cliStatus,
  errorMessage,
  installCli,
  installCliElevated,
} from "../lib/api";
import type { CliStatus } from "../types";

/**
 * The way back to the CLI install after the startup banner has been
 * dismissed — including with "Never", which would otherwise be a dead end.
 */
export function CliMenuItem() {
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    cliStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const needsPassword = !!status && !status.target && !!status.elevatedTarget;

  const install = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(needsPassword ? await installCliElevated() : await installCli());
    } catch (err) {
      const message = errorMessage(err);
      setError(message === "Cancelled." ? null : message);
    } finally {
      setBusy(false);
    }
  }, [needsPassword]);

  // Unbundled builds have nothing stable to link to, and there is no point
  // offering an install with nowhere on PATH to put it.
  const destination = status?.target ?? status?.elevatedTarget ?? null;
  if (!status?.available || !destination) return null;

  return (
    <>
      <div className="menu-rule" />
      {status.installed ? (
        <div className="menu-note">
          <span>✓ `markdiff` command installed</span>
          <span className="menu-path">{status.installedAt}</span>
        </div>
      ) : (
        <button
          type="button"
          className="menu-action"
          onClick={install}
          disabled={busy}
          title={destination}
        >
          {busy
            ? "Installing…"
            : needsPassword
              ? "Install `markdiff` command (needs password)…"
              : "Install `markdiff` command…"}
        </button>
      )}
      {error && <div className="menu-error">{error}</div>}
    </>
  );
}
