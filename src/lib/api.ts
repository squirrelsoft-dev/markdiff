import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

import type { CliStatus, DiffOptions, DiffResult, Doc } from "../types";

const MARKDOWN_EXTENSIONS = [
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mdx",
  "txt",
  "text",
];

/** Returns the chosen path, or `null` if the user dismissed the dialog. */
export async function pickDocument(title: string): Promise<string | null> {
  const selected = await open({
    title,
    multiple: false,
    directory: false,
    filters: [
      { name: "Markdown", extensions: MARKDOWN_EXTENSIONS },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return typeof selected === "string" ? selected : null;
}

export function readDocument(path: string): Promise<Doc> {
  return invoke<Doc>("read_document", { path });
}

export function writeDocument(path: string, content: string): Promise<Doc> {
  return invoke<Doc>("write_document", { path, content });
}

/** Returns the chosen path, or `null` if the user dismissed the dialog. */
export async function pickSavePath(
  suggested: string,
): Promise<string | null> {
  const chosen = await save({
    title: "Save markdown",
    defaultPath: suggested,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });
  return chosen ?? null;
}

export function computeDiff(
  left: string,
  right: string,
  options: DiffOptions,
): Promise<DiffResult> {
  return invoke<DiffResult>("compute_diff", { left, right, options });
}

/** Passing an empty list stops watching. */
export function watchPaths(paths: string[]): Promise<void> {
  return invoke<void>("watch_paths", { paths });
}

/** Up to two file paths given on the command line. */
export function startupPaths(): Promise<string[]> {
  return invoke<string[]>("startup_paths");
}

export function cliStatus(): Promise<CliStatus> {
  return invoke<CliStatus>("cli_status");
}

/** Symlinks the bundled launcher into a directory on the user's PATH. */
export function installCli(): Promise<CliStatus> {
  return invoke<CliStatus>("install_cli");
}

/** Same, into /usr/local/bin, behind the macOS administrator prompt. */
export function installCliElevated(): Promise<CliStatus> {
  return invoke<CliStatus>("install_cli_elevated");
}

/** Remembers that the user does not want to be offered this again. */
export function dismissCliPrompt(): Promise<void> {
  return invoke<void>("dismiss_cli_prompt");
}

/** Hands a link to the OS so it never navigates the app's own webview. */
export function openExternal(url: string): Promise<void> {
  return openUrl(url);
}

export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
