mod protocol;
mod metrics;
mod battery;
mod pressure;
mod state;

use serde::Deserialize;
use protocol::{read_message, write_message};
use metrics::collect_metrics;
use battery::get_battery_info;
use pressure::compute_pressure;
use state::StateResponse;

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum Request {
    #[serde(rename = "get_state")]
    GetState,
}

fn main() -> std::io::Result<()> {
    loop {
        let Some(raw) = read_message()? else { break; };

        let req: Request = match serde_json::from_slice(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };

        match req {
            Request::GetState => {
                let metrics = collect_metrics();
                let (on_battery, battery_percent) = get_battery_info();

                let (pressure_score, pressure_level, pressure_reasons) =
                    compute_pressure(
                        metrics.total_mb,
                        metrics.used_mb,
                        metrics.free_mb,
                        metrics.cpu_percent,
                        on_battery,
                    );

                let resp = StateResponse {
                    type_: "state",
                    ram_total_mb: metrics.total_mb,
                    ram_used_mb: metrics.used_mb,
                    ram_free_mb: metrics.free_mb,
                    cpu_usage_percent: metrics.cpu_percent,
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