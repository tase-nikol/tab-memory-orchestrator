use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};
use sysinfo::System;

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum Request {
    #[serde(rename = "get_state")]
    GetState,
}

#[derive(Debug, Serialize)]
struct StateResponse {
    type_: &'static str,

    ram_total_mb: u64,
    ram_used_mb: u64,
    ram_free_mb: u64,
    cpu_usage_percent: f32,

    // Battery info (macOS laptops). None if unavailable.
    on_battery: Option<bool>,
    battery_percent: Option<f32>,

    pressure_level: String,
    pressure_score: u8, // 0..100
    pressure_reasons: Vec<String>, // ["RAM_HIGH", "CPU_HIGH", "ON_BATTERY"]
}

fn read_message() -> io::Result<Option<Vec<u8>>> {
    let mut stdin = io::stdin();
    let mut length_bytes = [0u8; 4];

    match stdin.read_exact(&mut length_bytes) {
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }

    let length = u32::from_le_bytes(length_bytes) as usize;
    let mut buffer = vec![0u8; length];
    stdin.read_exact(&mut buffer)?;
    Ok(Some(buffer))
}

fn write_message(json_bytes: &[u8]) -> io::Result<()> {
    let mut stdout = io::stdout();
    let length = (json_bytes.len() as u32).to_le_bytes();
    stdout.write_all(&length)?;
    stdout.write_all(json_bytes)?;
    stdout.flush()?;
    Ok(())
}

fn get_battery_info() -> (Option<bool>, Option<f32>) {
    // Returns (on_battery, battery_percent)
    // If any step fails, return (None, None) safely.
    let manager = match battery::Manager::new() {
        Ok(m) => m,
        Err(_) => return (None, None),
    };

    let mut batteries = match manager.batteries() {
        Ok(b) => b,
        Err(_) => return (None, None),
    };

    // Most Macs have one battery; if multiple, we’ll take the first.
    let battery = match batteries.next() {
        Some(Ok(b)) => b,
        _ => return (None, None),
    };

    // battery.state_of_charge() is 0.0..1.0
    let percent = (battery.state_of_charge().value * 100.0) as f32;

    // If the system is discharging, we’re on battery
    let on_battery = matches!(battery.state(), battery::State::Discharging);

    (Some(on_battery), Some(percent))
}

fn compute_pressure(total_mb: u64, used_mb: u64, free_mb: u64, cpu_percent: f32, on_battery: Option<bool>) -> (u8, String, Vec<String>) {
    if total_mb == 0 {
        return (0, "LOW".into(), vec![]);
    }

    let used_ratio = used_mb as f64 / total_mb as f64;
    let free_ratio = free_mb as f64 / total_mb as f64;

    // ----- RAM score (0..70) -----
    // The closer to "bad" ranges, the higher the score.
    // used_ratio: 0.70 -> 0 points, 0.95 -> 70 points
    let ram_used_component = ((used_ratio - 0.70) / (0.95 - 0.70)).clamp(0.0, 1.0);
    let ram_used_score = (ram_used_component * 70.0).round() as i32;

    // free_ratio: 0.20 -> 0 points, 0.05 -> 70 points (low free is bad)
    let ram_free_component = ((0.20 - free_ratio) / (0.20 - 0.05)).clamp(0.0, 1.0);
    let ram_free_score = (ram_free_component * 70.0).round() as i32;

    // Take the worse of used-based and free-based RAM pressure
    let ram_score = ram_used_score.max(ram_free_score);

    // ----- CPU score (0..20) -----
    // cpu: 40% -> 0 points, 95% -> 20 points
    let cpu_component = (((cpu_percent as f64) - 40.0) / (95.0 - 40.0)).clamp(0.0, 1.0);
    let cpu_score = (cpu_component * 20.0).round() as i32;

    // ----- Battery bonus (0 or 10) -----
    let battery_score = match on_battery {
        Some(true) => 10,
        _ => 0,
    };

    // Total score 0..100
    let mut score = ram_score + cpu_score + battery_score;
    if score < 0 { score = 0; }
    if score > 100 { score = 100; }

    // Reasons (for transparency/UI)
    let mut reasons: Vec<String> = vec![];

    // RAM reasons
    if free_ratio < 0.12 || used_ratio > 0.85 {
        reasons.push("RAM_ELEVATED".into());
    }
    if free_ratio < 0.07 || used_ratio > 0.93 {
        reasons.push("RAM_HIGH".into());
    }

    // CPU reasons
    if cpu_percent > 75.0 {
        reasons.push("CPU_ELEVATED".into());
    }
    if cpu_percent > 90.0 {
        reasons.push("CPU_HIGH".into());
    }

    // Battery reason
    if matches!(on_battery, Some(true)) {
        reasons.push("ON_BATTERY".into());
    }

    // Level derived from score
    let level = if score >= 75 {
        "HIGH"
    } else if score >= 50 {
        "MEDIUM"
    } else {
        "LOW"
    }.to_string();

    (score as u8, level, reasons)
}
 

fn main() -> io::Result<()> {
    loop {
        let Some(raw) = read_message()? else { break; };

        let req: Request = match serde_json::from_slice(&raw) {
            Ok(v) => v,
            Err(_) => {
                let err = serde_json::json!({ "type": "error", "message": "invalid JSON request" });
                write_message(err.to_string().as_bytes())?;
                continue;
            }
        };

        match req {
            Request::GetState => {
                let mut sys = System::new_all();

                sys.refresh_memory();
                sys.refresh_cpu();

                // CPU usage needs a short delay between refreshes
                std::thread::sleep(std::time::Duration::from_millis(200));
                sys.refresh_cpu();

                let total_mb = sys.total_memory() / 1024;
                let used_mb = sys.used_memory() / 1024;
                let free_mb = (sys.total_memory().saturating_sub(sys.used_memory())) / 1024; 

                let cpu_usage = sys.global_cpu_info().cpu_usage();

                let (on_battery, battery_percent) = get_battery_info();
                
                let (pressure_score, pressure_level, pressure_reasons) = compute_pressure(total_mb, used_mb, free_mb, cpu_usage, on_battery);

                let resp = StateResponse {
                    type_: "state",
                    ram_total_mb: total_mb,
                    ram_used_mb: used_mb,
                    ram_free_mb: free_mb,
                    cpu_usage_percent: cpu_usage,
                    on_battery,
                    battery_percent,
                    pressure_level,
                    pressure_score,
                    pressure_reasons,
                };
                let bytes = serde_json::to_vec(&resp).unwrap();
                write_message(&bytes)?;
            }
        }
    }

    Ok(())
}