pub fn compute_pressure(
    total_mb: u64,
    used_mb: u64,
    free_mb: u64,
    cpu_percent: f32,
    on_battery: Option<bool>,
) -> (u8, String, Vec<String>) {
    if total_mb == 0 {
        return (0, "LOW".into(), vec![]);
    }

    let used_ratio = used_mb as f64 / total_mb as f64;
    let free_ratio = free_mb as f64 / total_mb as f64;

    let ram_used_component = ((used_ratio - 0.70) / (0.95 - 0.70)).clamp(0.0, 1.0);
    let ram_used_score = (ram_used_component * 70.0).round() as i32;

    let ram_free_component = ((0.20 - free_ratio) / (0.20 - 0.05)).clamp(0.0, 1.0);
    let ram_free_score = (ram_free_component * 70.0).round() as i32;

    let ram_score = ram_used_score.max(ram_free_score);

    let cpu_component = (((cpu_percent as f64) - 40.0) / (95.0 - 40.0)).clamp(0.0, 1.0);
    let cpu_score = (cpu_component * 20.0).round() as i32;

    let battery_score = if matches!(on_battery, Some(true)) { 10 } else { 0 };

    let mut score = ram_score + cpu_score + battery_score;
    score = score.clamp(0, 100);

    let mut reasons = vec![];

    if free_ratio < 0.12 || used_ratio > 0.85 {
        reasons.push("RAM_ELEVATED".into());
    }
    if free_ratio < 0.07 || used_ratio > 0.93 {
        reasons.push("RAM_HIGH".into());
    }
    if cpu_percent > 75.0 {
        reasons.push("CPU_ELEVATED".into());
    }
    if cpu_percent > 90.0 {
        reasons.push("CPU_HIGH".into());
    }
    if matches!(on_battery, Some(true)) {
        reasons.push("ON_BATTERY".into());
    }

    let level = if score >= 75 {
        "HIGH"
    } else if score >= 50 {
        "MEDIUM"
    } else {
        "LOW"
    }
    .to_string();

    (score as u8, level, reasons)
}