//! Prints the diff engine's output for two files as JSON, for inspecting
//! the result without going through the UI.
//!
//!     cargo run --example diff-json -- old.md new.md

use markdiff_lib::diff::{diff_markdown, DiffOptions};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [old, new] = args.as_slice() else {
        eprintln!("usage: diff-json <old.md> <new.md>");
        std::process::exit(2);
    };

    let old_text = std::fs::read_to_string(old).expect("read old file");
    let new_text = std::fs::read_to_string(new).expect("read new file");

    let result = diff_markdown(&old_text, &new_text, DiffOptions::default());
    println!(
        "{}",
        serde_json::to_string_pretty(&result).expect("serialise diff")
    );
}
