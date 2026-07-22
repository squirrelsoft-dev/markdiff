//! Watches the two loaded documents so an edit in the user's real editor
//! shows up in the diff without them having to reopen anything.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

/// Holds the live watcher. Replacing it drops the previous one, which is
/// how we stop watching files that are no longer loaded.
#[derive(Default)]
pub struct WatchState(pub Mutex<Option<RecommendedWatcher>>);

/// Emitted with the path of the file that changed on disk.
const FILE_CHANGED: &str = "file-changed";

#[tauri::command]
pub fn watch_paths(
    app: AppHandle,
    state: State<'_, WatchState>,
    paths: Vec<String>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    if paths.is_empty() {
        *guard = None;
        return Ok(());
    }

    let targets: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    let watched = targets.clone();
    let handle = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        for changed in &event.paths {
            if let Some(target) = watched.iter().find(|t| same_file(t, changed)) {
                let _ = handle.emit(FILE_CHANGED, target.to_string_lossy().to_string());
            }
        }
    })
    .map_err(|e| e.to_string())?;

    // Watch the containing directory rather than the file: editors that
    // save by writing a temp file and renaming it over the original would
    // otherwise take the watch down with the replaced inode.
    let mut dirs: HashSet<&Path> = HashSet::new();
    for target in &targets {
        if let Some(dir) = target.parent() {
            dirs.insert(dir);
        }
    }
    for dir in dirs {
        watcher
            .watch(dir, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;
    }

    *guard = Some(watcher);
    Ok(())
}

/// Compares paths tolerantly — a file being replaced can make
/// `canonicalize` fail mid-save, so fall back to the literal comparison.
fn same_file(target: &Path, changed: &Path) -> bool {
    if target == changed {
        return true;
    }
    match (target.canonicalize(), changed.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}
