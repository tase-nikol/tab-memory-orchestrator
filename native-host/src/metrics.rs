use sysinfo::{System};

pub struct Metrics {
    pub total_mb: u64,
    pub used_mb: u64,
    pub free_mb: u64,
    pub cpu_percent: f32,
}

pub fn collect_metrics() -> Metrics {
    let mut sys = System::new_all();

    sys.refresh_memory();
    sys.refresh_cpu();

    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu();

    let total_mb = sys.total_memory() / 1024;
    let used_mb = sys.used_memory() / 1024;
    let free_mb = (sys.total_memory().saturating_sub(sys.used_memory())) / 1024;

    let cpu_percent = sys.global_cpu_info().cpu_usage();

    Metrics {
        total_mb,
        used_mb,
        free_mb,
        cpu_percent,
    }
}