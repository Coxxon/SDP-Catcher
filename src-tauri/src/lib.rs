use get_if_addrs::get_if_addrs;
use serde::Serialize;
use std::net::{UdpSocket, Ipv4Addr};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
pub struct NetworkInterface {
    name: String,
    ip: String,
    mask: String,
}

#[derive(Serialize, Clone)]
struct SdpPayload {
    source_ip: String,
    sdp_content: String,
}

pub struct AppState {
    sniffer_stop_flag: Mutex<Option<Arc<AtomicBool>>>,
}

#[tauri::command]
fn get_network_interfaces() -> Vec<NetworkInterface> {
    let mut interfaces = Vec::new();

    if let Ok(if_addrs) = get_if_addrs() {
        for iface in if_addrs {
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

#[tauri::command]
fn start_sniffing(app: AppHandle, interface_ip: String, state: State<'_, AppState>) {
    // 1. Stop existing thread if any
    let mut stop_flag_lock = state.sniffer_stop_flag.lock().unwrap();
    if let Some(old_flag) = stop_flag_lock.take() {
        old_flag.store(true, Ordering::Relaxed);
    }

    // 2. Create new flag and store it
    let stop_flag = Arc::new(AtomicBool::new(false));
    *stop_flag_lock = Some(Arc::clone(&stop_flag));
    drop(stop_flag_lock); // Release lock before spawning thread

    // 3. Start listening in a separate thread
    thread::spawn(move || {
        let sap_addr = Ipv4Addr::new(239, 255, 255, 255);
        let bind_addr = Ipv4Addr::new(0, 0, 0, 0); 
        let iface_addr: Ipv4Addr = interface_ip.parse().expect("Invalid interface IP");
        let port = 9875;

        // Create socket
        let socket = match UdpSocket::bind((bind_addr, port)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to bind UDP socket on {}:{}: {}", bind_addr, port, e);
                return;
            }
        };

        socket.set_read_timeout(Some(Duration::from_millis(200))).ok();
        
        if let Err(e) = socket.join_multicast_v4(&sap_addr, &iface_addr) {
            eprintln!("Failed to join multicast group: {}", e);
            return;
        }

        let mut buf = [0u8; 4096];
        while !stop_flag.load(Ordering::Relaxed) {
            match socket.recv_from(&mut buf) {
                Ok((size, src)) => {
                    let payload = &buf[..size];
                    
                    // SAP packets contain a binary header, search for "v=0" which starts the SDP
                    if let Some(pos) = payload.windows(3).position(|w| w == b"v=0") {
                        if let Ok(sdp_content) = std::str::from_utf8(&payload[pos..]) {
                            app.emit("sdp-discovered", SdpPayload {
                                source_ip: src.ip().to_string(),
                                sdp_content: sdp_content.to_string(),
                            }).ok();
                        }
                    }
                }
                Err(_) => {
                    // Timeout is expected, continue loop to check stop flag
                }
            }
        }

        socket.leave_multicast_v4(&sap_addr, &iface_addr).ok();
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            sniffer_stop_flag: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_network_interfaces, start_sniffing])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
