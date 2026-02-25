pub fn get_battery_info() -> (Option<bool>, Option<f32>) {
    let manager = match battery::Manager::new() {
        Ok(m) => m,
        Err(_) => return (None, None),
    };

    let mut batteries = match manager.batteries() {
        Ok(b) => b,
        Err(_) => return (None, None),
    };

    let battery = match batteries.next() {
        Some(Ok(b)) => b,
        _ => return (None, None),
    };

    let percent = (battery.state_of_charge().value * 100.0) as f32;
    let on_battery = matches!(battery.state(), battery::State::Discharging);

    (Some(on_battery), Some(percent))
}