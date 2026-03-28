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

    for iface in netdev::get_interfaces() {
        // We only want active interfaces with IPv4 addresses
        if iface.is_loopback() {
            continue;
        }

        for ipv4 in iface.ipv4 {
            interfaces.push(NetworkInterface {
                name: iface.friendly_name.clone().unwrap_or(iface.name.clone()),
                ip: ipv4.addr.to_string(),
                mask: ipv4.netmask.to_string(),
            });
        }
    }

    interfaces
}

#[tauri::command]
fn start_sniffing(app: AppHandle, interface_ip: String, state: State<'_, AppState>) {
    println!("🚀 Commande Rust reçue : Démarrage sur {}", interface_ip);
    
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
                    println!("📦 Paquet UDP reçu ! (taille: {})", size);
                    let payload = &buf[..size];

                    // SAP packets contain a binary header, search for "v=0" which starts the SDP
                    if let Some(pos) = payload.windows(3).position(|w| w == b"v=0") {
                        if let Ok(sdp_content) = std::str::from_utf8(&payload[pos..]) {
                            println!("✅ SDP parsé avec succès, émission IPC en cours...");
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

#[tauri::command]
fn stop_sniffing(state: State<'_, AppState>) {
    println!("🛑 Commande Rust reçue : Arrêt du sniffing");
    let mut stop_flag_lock = state.sniffer_stop_flag.lock().unwrap();
    if let Some(old_flag) = stop_flag_lock.take() {
        old_flag.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
fn set_network_ip(interface_name: String, is_dhcp: bool, ip: Option<String>, mask: Option<String>) -> Result<String, String> {
    println!("🔧 Modification réseau : {} (DHCP: {})", interface_name, is_dhcp);
    
    let mut cmd = std::process::Command::new("netsh");
    cmd.arg("interface").arg("ip").arg("set").arg("address");
    cmd.arg(format!("name=\"{}\"", interface_name));

    if is_dhcp {
        cmd.arg("source=dhcp");
    } else {
        if let (Some(ip_addr), Some(mask_addr)) = (ip, mask) {
            cmd.arg("static").arg(ip_addr).arg(mask_addr);
        } else {
            return Err("IP and Mask are required for static configuration".to_string());
        }
    }

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok("Configuration appliquée avec succès".to_string())
            } else {
                let err = String::from_utf8_lossy(&output.stderr).to_string();
                let out = String::from_utf8_lossy(&output.stdout).to_string();
                Err(format!("Erreur netsh : {} {}", err, out))
            }
        }
        Err(e) => Err(format!("Échec de l'exécution de netsh : {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            sniffer_stop_flag: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_network_interfaces, start_sniffing, stop_sniffing, set_network_ip])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
