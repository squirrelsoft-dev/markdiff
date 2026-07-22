//! Offers to put a `markdiff` command on the user's PATH.
//!
//! The link points at the launcher script inside the bundle rather than at
//! the executable, so the command detaches from the terminal and resolves
//! relative paths — and because it is a symlink, it keeps working when the
//! app is replaced by a newer copy.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// The name the command takes on PATH, and of the launcher in the bundle.
const COMMAND: &str = "markdiff";

/// Where a command like this conventionally goes, best first. A directory
/// is only used if it is already on the user's PATH and accepts writes —
/// this never edits anyone's shell profile to make one work.
///
/// `/usr/local/bin` leads because `/etc/paths` ships it first, so it is on
/// PATH for every account without any setup. Homebrew's own prefixes
/// (`/opt/homebrew/bin`, and `/usr/local/bin` on Intel) are deliberately
/// absent as *targets we create*: that is Homebrew's namespace to manage,
/// and `brew doctor` reports foreign files there.
const CANDIDATES: &[&str] = &["/usr/local/bin", "~/.local/bin", "~/bin"];

/// Where an elevated install goes when nothing above is writable. On a
/// stock Apple Silicon machine `/usr/local/bin` is root-owned, or absent.
const SYSTEM_DIR: &str = "/usr/local/bin";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    /// A link for this app is already in place.
    pub installed: bool,
    pub installed_at: Option<String>,
    /// Where installing would put it, needing no password. `None` when no
    /// directory on the user's PATH accepts writes.
    pub target: Option<String>,
    /// Where an elevated install would put it, offered only when `target`
    /// is `None`. Costs an administrator prompt, so it is never automatic.
    pub elevated_target: Option<String>,
    /// False when running unbundled, where there is nothing stable to link to.
    pub available: bool,
    /// The user asked not to be offered this again.
    pub dismissed: bool,
}

#[tauri::command]
pub fn cli_status(app: AppHandle) -> CliStatus {
    status(&app)
}

#[tauri::command]
pub fn install_cli(app: AppHandle) -> Result<CliStatus, String> {
    let launcher =
        launcher_path(&app).ok_or("This copy of markdiff has no launcher to link to.")?;

    let dir =
        target_dir().ok_or("Could not find a writable directory on your PATH to install into.")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;

    let link = dir.join(COMMAND);

    // Replace a link we (or a previous install) made, but never overwrite
    // something the user put there themselves.
    if let Ok(meta) = std::fs::symlink_metadata(&link) {
        if !meta.file_type().is_symlink() {
            return Err(format!(
                "{} already exists and is not a symlink, so it has been left alone.",
                link.display()
            ));
        }
        std::fs::remove_file(&link).map_err(|e| format!("{}: {e}", link.display()))?;
    }

    symlink_file(&launcher, &link).map_err(|e| format!("{}: {e}", link.display()))?;

    Ok(status(&app))
}

/// A symlink at `dst` pointing to `src`. The feature is dormant off macOS
/// (there is no `.app` to link into), but the code still has to compile
/// for the Windows and Linux release builds.
#[cfg(unix)]
fn symlink_file(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(src, dst)
}

#[cfg(not(unix))]
fn symlink_file(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_file(src, dst)
}

/// Installs into `/usr/local/bin` behind the standard macOS administrator
/// prompt. Separate from [`install_cli`] so that asking for a password is
/// always something the user chose, never a surprise.
#[tauri::command]
pub fn install_cli_elevated(app: AppHandle) -> Result<CliStatus, String> {
    let launcher =
        launcher_path(&app).ok_or("This copy of markdiff has no launcher to link to.")?;

    let dir = PathBuf::from(SYSTEM_DIR);
    let link = dir.join(COMMAND);

    if let Ok(meta) = std::fs::symlink_metadata(&link) {
        if !meta.file_type().is_symlink() {
            return Err(format!(
                "{} already exists and is not a symlink, so it has been left alone.",
                link.display()
            ));
        }
    }

    // `-sfn` replaces an existing link rather than nesting inside it, so
    // running this twice is harmless.
    let shell_command = format!(
        "/bin/mkdir -p {} && /bin/ln -sfn {} {}",
        shell_quote(&dir),
        shell_quote(&launcher),
        shell_quote(&link)
    );
    let script = format!(
        "do shell script \"{}\" with administrator privileges",
        applescript_escape(&shell_command)
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Could not ask for permission: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("User canceled") || stderr.contains("(-128)") {
            return Err("Cancelled.".to_string());
        }
        return Err(stderr.trim().to_string());
    }

    Ok(status(&app))
}

/// Wraps a path so the shell sees it as one literal word.
fn shell_quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', r"'\''"))
}

/// Escapes a shell command for embedding in an AppleScript string literal.
/// The command passes through two layers of quoting, and getting either
/// wrong on a path containing a quote would change what runs as root.
fn applescript_escape(text: &str) -> String {
    text.replace('\\', r"\\").replace('"', "\\\"")
}

#[tauri::command]
pub fn dismiss_cli_prompt(app: AppHandle) -> Result<(), String> {
    let path = dismissal_marker(&app).ok_or("No config directory available.")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(&path, "The CLI install prompt was declined.\n")
        .map_err(|e| format!("{}: {e}", path.display()))
}

fn status(app: &AppHandle) -> CliStatus {
    let launcher = launcher_path(app);
    let existing = find_existing_link(launcher.as_deref());
    let target = target_dir();

    // Only fall back to asking for a password when there is genuinely no
    // way to do this without one.
    let elevated_target = target
        .is_none()
        .then(|| Path::new(SYSTEM_DIR).join(COMMAND).display().to_string());

    CliStatus {
        installed: existing.is_some(),
        installed_at: existing.map(|p| p.display().to_string()),
        target: target.map(|d| d.join(COMMAND).display().to_string()),
        elevated_target,
        available: launcher.is_some(),
        dismissed: dismissal_marker(app).is_some_and(|p| p.exists()),
    }
}

/// The launcher shipped in the bundle, if this build has one and it is
/// actually runnable.
fn launcher_path(app: &AppHandle) -> Option<PathBuf> {
    if !in_app_bundle() {
        return None;
    }
    let path = app.path().resource_dir().ok()?.join(COMMAND);
    is_executable(&path).then_some(path)
}

/// Whether this process is running from inside a `.app`. Unbundled runs
/// (`cargo run`) have no stable path worth linking into someone's PATH.
fn in_app_bundle() -> bool {
    std::env::current_exe().is_ok_and(|exe| {
        exe.components().any(|c| {
            Path::new(&c)
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
        })
    })
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    // Windows has no executable bit; a regular file is close enough, and
    // this path is not reached there anyway.
    path.is_file()
}

/// An existing `markdiff` link that points at this app's launcher.
fn find_existing_link(launcher: Option<&Path>) -> Option<PathBuf> {
    let launcher = launcher?;
    for dir in candidate_dirs() {
        let link = dir.join(COMMAND);
        if std::fs::read_link(&link).is_ok_and(|dest| dest == launcher) {
            return Some(link);
        }
    }
    None
}

/// The first candidate that is on PATH, exists and accepts writes.
fn target_dir() -> Option<PathBuf> {
    let path_var = login_shell_path()?;
    let on_path: Vec<&str> = path_var.split(':').collect();

    candidate_dirs()
        .into_iter()
        .find(|dir| on_path.iter().any(|p| Path::new(p) == dir) && is_writable(dir))
}

fn candidate_dirs() -> Vec<PathBuf> {
    CANDIDATES.iter().map(|c| expand(c)).collect()
}

fn expand(path: &str) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => home().join(rest),
        None => PathBuf::from(path),
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Probes with a real file: directory permission bits alone do not say
/// whether *this* user may write there.
fn is_writable(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }

    // The name must be unique per probe. A fixed one collides when two
    // probes run at once — `create_new` then fails on the existing file
    // and a perfectly writable directory looks read-only.
    static PROBE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let nth = PROBE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let probe = dir.join(format!(".markdiff-probe-{}-{nth}", std::process::id()));
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
    {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// The PATH a terminal would actually have.
///
/// The app's own PATH is useless here: launched from Finder it inherits
/// launchd's minimal one, which never contains the directories we care
/// about. Asking the login shell is the only way to get the real answer.
fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    let output = Command::new(shell)
        .args(["-lc", r#"printf '\n%s' "$PATH""#])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    // Startup files may print banners of their own, so take the last line,
    // which is the one our printf emitted.
    let stdout = String::from_utf8(output.stdout).ok()?;
    let path = stdout.lines().next_back()?.trim();
    (!path.is_empty()).then(|| path.to_string())
}

fn dismissal_marker(app: &AppHandle) -> Option<PathBuf> {
    Some(
        app.path()
            .app_config_dir()
            .ok()?
            .join("cli-prompt-declined"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tilde_expands_against_home() {
        assert_eq!(expand("~/.local/bin"), home().join(".local/bin"));
        assert_eq!(expand("/usr/local/bin"), PathBuf::from("/usr/local/bin"));
    }

    #[test]
    fn homebrew_prefixes_are_never_install_targets() {
        // Homebrew manages its own prefix; `brew doctor` flags strays.
        for dir in candidate_dirs() {
            assert_ne!(dir, PathBuf::from("/opt/homebrew/bin"));
            assert_ne!(dir, PathBuf::from("/opt/homebrew/sbin"));
        }
    }

    #[test]
    fn usr_local_bin_is_preferred() {
        // It is the only candidate on the stock macOS PATH (/etc/paths),
        // so it works without touching anyone's shell profile.
        assert_eq!(
            candidate_dirs().first().unwrap(),
            Path::new("/usr/local/bin")
        );
    }

    #[test]
    fn shell_quoting_survives_awkward_paths() {
        assert_eq!(shell_quote(Path::new("/a/b c")), "'/a/b c'");
        assert_eq!(shell_quote(Path::new("/it's/here")), r"'/it'\''s/here'");
    }

    #[test]
    fn applescript_escaping_protects_both_layers() {
        assert_eq!(applescript_escape(r#"say "hi""#), r#"say \"hi\""#);
        assert_eq!(applescript_escape(r"back\slash"), r"back\\slash");
        // Backslashes must be escaped before quotes, or the escape added
        // for a quote would itself get escaped.
        assert_eq!(applescript_escape(r#"\""#), r#"\\\""#);
    }

    #[test]
    fn an_elevated_target_is_only_offered_as_a_last_resort() {
        // Whenever a no-password target exists, status must not ask for one.
        if target_dir().is_some() {
            assert!(
                candidate_dirs().iter().any(|d| is_writable(d)),
                "a usable target should imply a writable candidate"
            );
        }
    }

    #[test]
    fn a_directory_that_does_not_exist_is_not_writable() {
        assert!(!is_writable(Path::new("/nonexistent-markdiff-dir")));
    }

    #[test]
    fn a_root_owned_directory_is_not_writable() {
        // /usr/bin exists everywhere and is not user-writable, which is
        // exactly the case the probe has to catch.
        assert!(!is_writable(Path::new("/usr/bin")));
    }

    #[test]
    fn the_temp_directory_is_writable() {
        assert!(is_writable(&std::env::temp_dir()));
    }

    #[test]
    fn write_probe_leaves_nothing_behind() {
        let dir = std::env::temp_dir();
        is_writable(&dir);
        let leftovers = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(".markdiff-probe-")
            })
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn concurrent_probes_of_one_directory_all_succeed() {
        let dir = std::env::temp_dir();
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let dir = dir.clone();
                std::thread::spawn(move || is_writable(&dir))
            })
            .collect();
        for handle in handles {
            assert!(
                handle.join().unwrap(),
                "a concurrent probe reported read-only"
            );
        }
    }

    #[test]
    fn login_shell_path_is_richer_than_launchd_default() {
        // Guards the reason this indirection exists at all.
        let Some(path) = login_shell_path() else {
            return; // no usable shell in this environment
        };
        assert!(path.contains("/bin"), "unexpected PATH: {path}");
    }
}
