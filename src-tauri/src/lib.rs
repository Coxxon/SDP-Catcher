use get_if_addrs::get_if_addrs;
use serde::Serialize;

#[derive(Serialize)]
pub struct NetworkInterface {
    name: String,
    ip: String,
    mask: String,
}

#[tauri::command]
fn get_network_interfaces() -> Vec<NetworkInterface> {
    let mut interfaces = Vec::new();

    if let Ok(if_addrs) = get_if_addrs() {
        for iface in if_addrs {
            // We only care about IPv4 and non-loopback interfaces for AES67/SAP
            if !iface.is_loopback() {
                if let get_if_addrs::IfAddr::V4(v4_addr) = iface.addr {
                    interfaces.push(NetworkInterface {
                        name: iface.name,
                        ip: v4_addr.ip.to_string(),
                        mask: v4_addr.netmask.to_string(),
                    });
                }
            }
        }
    }

    interfaces
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_network_interfaces])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
