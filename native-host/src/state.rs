use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct StateResponse {
    pub type_: &'static str,

    pub ram_total_mb: u64,
    pub ram_used_mb: u64,
    pub ram_free_mb: u64,
    pub cpu_usage_percent: f32,

    pub on_battery: Option<bool>,
    pub battery_percent: Option<f32>,

    pub pressure_level: String,
    pub pressure_score: u8,
    pub pressure_reasons: Vec<String>,
}