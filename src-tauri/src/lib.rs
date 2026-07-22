mod cli_install;
pub mod diff;
mod redline;
mod watch;

use std::path::{Path, PathBuf};

use serde::Serialize;

use diff::{DiffOptions, DiffResult};
use watch::WatchState;

/// Refuse to load anything implausible as a hand-written document; the
/// whole file is held in memory and diffed word by word.
const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub path: String,
    pub name: String,
    pub content: String,
    pub bytes: u64,
}

#[tauri::command]
fn read_document(path: String) -> Result<Document, String> {
    let path_buf = PathBuf::from(&path);

    let meta =
        std::fs::metadata(&path_buf).map_err(|e| format!("{}: {e}", display_name(&path_buf)))?;
    if !meta.is_file() {
        return Err(format!("{} is not a file", display_name(&path_buf)));
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!(
            "{} is {:.1} MB — too large to diff (limit {} MB)",
            display_name(&path_buf),
            meta.len() as f64 / (1024.0 * 1024.0),
            MAX_FILE_BYTES / (1024 * 1024)
        ));
    }

    let bytes =
        std::fs::read(&path_buf).map_err(|e| format!("{}: {e}", display_name(&path_buf)))?;
    let content = String::from_utf8(bytes)
        .map_err(|_| format!("{} is not valid UTF-8 text", display_name(&path_buf)))?;

    Ok(Document {
        name: display_name(&path_buf),
        path: path_buf.to_string_lossy().to_string(),
        bytes: meta.len(),
        content,
    })
}

/// Writes a document back to disk and returns its refreshed metadata.
///
/// The content goes to a temporary file alongside the target and is then
/// renamed over it. A write that fails or is interrupted half way would
/// otherwise leave a truncated file where a good one used to be — and the
/// good one may be the only copy of what the user just typed.
#[tauri::command]
fn write_document(path: String, content: String) -> Result<Document, String> {
    if path.is_empty() {
        return Err("This pane is not attached to a file yet.".to_string());
    }

    let target = PathBuf::from(&path);
    let name = display_name(&target);
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| format!("{name} has no containing directory"))?;

    let temp = dir.join(format!(".{name}.markdiff-tmp"));
    std::fs::write(&temp, content.as_bytes()).map_err(|e| format!("{name}: {e}"))?;

    // Keep whatever permissions the file already had; a fresh temp file
    // would otherwise quietly widen them to the default.
    if let Ok(existing) = std::fs::metadata(&target) {
        let _ = std::fs::set_permissions(&temp, existing.permissions());
    }

    if let Err(e) = std::fs::rename(&temp, &target) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("{name}: {e}"));
    }

    Ok(Document {
        name,
        path: target.to_string_lossy().to_string(),
        bytes: content.len() as u64,
        content,
    })
}

#[tauri::command]
fn compute_diff(left: String, right: String, options: Option<DiffOptions>) -> DiffResult {
    diff::diff_markdown(&left, &right, options.unwrap_or_default())
}

/// Files named on the command line, so `markdiff a.md b.md` opens ready to read.
#[tauri::command]
fn startup_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        // `tauri dev` adds arguments of its own; only real files get through.
        .filter(|arg| Path::new(arg).is_file())
        .take(2)
        .collect()
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WatchState::default())
        .invoke_handler(tauri::generate_handler![
            read_document,
            write_document,
            compute_diff,
            startup_paths,
            watch::watch_paths,
            cli_install::cli_status,
            cli_install::install_cli,
            cli_install::install_cli_elevated,
            cli_install::dismiss_cli_prompt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A unique path under the temp directory, so tests cannot collide.
    fn scratch(label: &str) -> PathBuf {
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let nth = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "markdiff-test-{}-{nth}-{label}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("create scratch dir");
        dir
    }

    #[test]
    fn writes_content_and_reports_it_back() {
        let file = scratch("write").join("note.md");
        let doc = write_document(file.to_string_lossy().into(), "# Hi\n".into()).unwrap();

        assert_eq!(std::fs::read_to_string(&file).unwrap(), "# Hi\n");
        assert_eq!(doc.name, "note.md");
        assert_eq!(doc.bytes, 5);
        assert_eq!(doc.content, "# Hi\n");
    }

    #[test]
    fn overwrites_an_existing_file_completely() {
        let file = scratch("overwrite").join("note.md");
        std::fs::write(&file, "a much longer original document\n").unwrap();

        write_document(file.to_string_lossy().into(), "short\n".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "short\n");
    }

    #[test]
    fn leaves_no_temporary_file_behind() {
        let dir = scratch("tidy");
        let file = dir.join("note.md");
        write_document(file.to_string_lossy().into(), "x\n".into()).unwrap();

        let strays: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n != "note.md")
            .collect();
        assert!(strays.is_empty(), "left behind: {strays:?}");
    }

    // Unix mode bits only; Windows has a different permission model.
    #[cfg(unix)]
    #[test]
    fn keeps_the_permissions_the_file_already_had() {
        use std::os::unix::fs::PermissionsExt;

        let file = scratch("perms").join("private.md");
        std::fs::write(&file, "secret\n").unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600)).unwrap();

        write_document(file.to_string_lossy().into(), "still secret\n".into()).unwrap();

        let mode = std::fs::metadata(&file).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600, "a save must not widen permissions");
    }

    #[test]
    fn refuses_a_pane_with_no_file() {
        assert!(write_document(String::new(), "x".into()).is_err());
    }

    #[test]
    fn round_trips_through_read_document() {
        let file = scratch("roundtrip").join("note.md");
        let text = "# Title\n\nBody with é and — dashes.\n";
        write_document(file.to_string_lossy().into(), text.into()).unwrap();

        let read = read_document(file.to_string_lossy().into()).unwrap();
        assert_eq!(read.content, text);
    }

    #[test]
    fn reports_a_directory_that_does_not_exist() {
        let missing = std::env::temp_dir().join("markdiff-no-such-dir/note.md");
        assert!(write_document(missing.to_string_lossy().into(), "x".into()).is_err());
    }
}
