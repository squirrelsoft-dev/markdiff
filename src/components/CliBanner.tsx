import { useCallback, useEffect, useState } from "react";

import {
  cliStatus,
  dismissCliPrompt,
  errorMessage,
  installCli,
  installCliElevated,
} from "../lib/api";
import type { CliStatus } from "../types";

type Outcome = { kind: "installed"; at: string } | { kind: "failed"; message: string };

/**
 * Offers to put a `markdiff` command on the user's PATH, once, the first
 * time the app runs from a bundle. Deliberately a strip rather than a
 * modal: it is an aside, not something to answer before working.
 */
export function CliBanner() {
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    cliStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  // Falls back to the administrator prompt only when there is no
  // password-free directory to install into.
  const needsPassword = !!status && !status.target && !!status.elevatedTarget;

  const install = useCallback(async () => {
    setBusy(true);
    try {
      const next = needsPassword ? await installCliElevated() : await installCli();
      setStatus(next);
      setOutcome({
        kind: "installed",
        at: next.installedAt ?? next.target ?? next.elevatedTarget ?? "",
      });
    } catch (err) {
      const message = errorMessage(err);
      // Backing out of the password prompt is a decision, not a failure —
      // leave the offer standing rather than reporting an error.
      setOutcome(message === "Cancelled." ? null : { kind: "failed", message });
    } finally {
      setBusy(false);
    }
  }, [needsPassword]);

  const never = useCallback(() => {
    setHidden(true);
    void dismissCliPrompt().catch(() => {});
  }, []);

  if (outcome?.kind === "installed") {
    return (
      <div className="banner banner-quiet">
        <span>
          Installed. <code className="banner-code">markdiff a.md b.md</code> now
          works from any terminal
          {outcome.at ? ` (${outcome.at})` : ""}.
        </span>
        <button
          type="button"
          className="banner-dismiss"
          onClick={() => setHidden(true)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  if (outcome?.kind === "failed") {
    return (
      <div className="banner banner-error" role="alert">
        <span>Could not install the command: {outcome.message}</span>
        <button
          type="button"
          className="banner-dismiss"
          onClick={() => setHidden(true)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  // Nothing to offer: already installed, previously declined, running
  // unbundled, or nowhere on PATH to put it even with a password.
  const destination = status?.target ?? status?.elevatedTarget ?? null;
  const offer =
    status?.available && !status.installed && !status.dismissed && destination;

  if (!offer || hidden) return null;

  return (
    <div className="banner banner-offer">
      <span className="banner-text">
        Use markdiff from the terminal? This links{" "}
        <code className="banner-code">markdiff</code> into{" "}
        <code className="banner-code">{directoryOf(destination)}</code>
        {needsPassword ? ", which needs your password" : ""}.
      </span>
      <div className="banner-actions">
        <button
          type="button"
          className="banner-primary"
          onClick={install}
          disabled={busy}
        >
          {busy ? "Installing…" : needsPassword ? "Install…" : "Install"}
        </button>
        <button type="button" onClick={() => setHidden(true)}>
          Not now
        </button>
        <button type="button" onClick={never}>
          Never
        </button>
      </div>
    </div>
  );
}

function directoryOf(target: string | null): string {
  if (!target) return "your PATH";
  const cut = target.lastIndexOf("/");
  return cut > 0 ? target.slice(0, cut) : target;
}
