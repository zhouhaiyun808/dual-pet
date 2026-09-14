//! Explicit debug-only short probe, run under the app's own code identity.
//! No permission prompts, input injection, application windows or personal save I/O.
use crate::input::InputCounter;
use serde::Serialize;
use std::{fs::OpenOptions, io::Write, path::Path, time::{Duration, Instant}};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sample { elapsed_ms: u128, health: crate::input::InputHealth, keys: u64, clicks: u64 }

pub fn input_probe(report: &Path) -> Result<(), String> {
    // Never overwrite any existing report or another user file.
    let mut file = OpenOptions::new().create_new(true).write(true).open(report).map_err(|e| e.to_string())?;
    let input = InputCounter::start();
    input.set_enabled(true);
    let start = Instant::now();
    let mut samples = Vec::new();
    for _ in 0..10 {
        std::thread::sleep(Duration::from_millis(100));
        let batch = input.drain();
        samples.push(Sample { elapsed_ms: start.elapsed().as_millis(), health: input.health(), keys: batch.keys, clicks: batch.clicks });
    }
    input.shutdown();
    let result = serde_json::json!({ "kind": "native-passive-input-probe", "durationMs": start.elapsed().as_millis(),
        "doubleClickIntervalMs": crate::get_double_click_interval(),
        "samples": samples, "stopped": input.health(),
        "note": "Only status and aggregate counts. No synthetic global input, no save writes, no permission requests." });
    file.write_all(serde_json::to_string_pretty(&result).map_err(|e| e.to_string())?.as_bytes()).map_err(|e| e.to_string())
}
