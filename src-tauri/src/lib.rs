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
fn start_sniffing(app: AppHandle, interface_ips: Vec<String>, state: State<'_, AppState>) {
    println!("🚀 Commande Rust reçue : Démarrage global sur {} interfaces", interface_ips.len());
    
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
        let port = 9875;

        let mut socket = None;
        let mut attempts = 0;
        let max_attempts = 5;

        // Loop to retry binding
        while attempts < max_attempts && !stop_flag.load(Ordering::Relaxed) {
            attempts += 1;
            println!("📥 Tentative de bind UDP global {}/{}...", attempts, max_attempts);
            
            match UdpSocket::bind((bind_addr, port)) {
                Ok(s) => {
                    s.set_read_timeout(Some(Duration::from_millis(500))).ok();
                    
                    // Join multicast group on each provided interface
                    let mut success_count = 0;
                    for ip in &interface_ips {
                        if let Ok(iface_addr) = ip.parse::<Ipv4Addr>() {
                            if let Err(e) = s.join_multicast_v4(&sap_addr, &iface_addr) {
                                eprintln!("⚠️ Échec du join multicast sur {} : {}", ip, e);
                            } else {
                                println!("✅ Joint le groupe multicast sur l'interface {}", ip);
                                success_count += 1;
                            }
                        }
                    }

                    if success_count == 0 && !interface_ips.is_empty() {
                         eprintln!("⚠️ Aucun join multicast n'a réussi, nouvelle tentative...");
                         thread::sleep(Duration::from_secs(1));
                         continue;
                    }

                    println!("✅ Bind UDP global réussi (Interfaces actives: {})", success_count);
                    socket = Some(s);
                    break;
                }
                Err(e) => {
                    eprintln!("⚠️ Échec du bind UDP global (tentative {}): {}", attempts, e);
                    thread::sleep(Duration::from_secs(1));
                }
            }
        }

        let socket = match socket {
            Some(s) => s,
            None => {
                eprintln!("❌ Échec définitif du bind UDP après {} tentatives", max_attempts);
                return;
            }
        };

        let mut buf = [0u8; 4096];
        while !stop_flag.load(Ordering::Relaxed) {
            match socket.recv_from(&mut buf) {
                Ok((size, src)) => {
                    let payload = &buf[..size];
                    if let Some(pos) = payload.windows(3).position(|w| w == b"v=0") {
                        if let Ok(sdp_content) = std::str::from_utf8(&payload[pos..]) {
                            app.emit("sdp-discovered", SdpPayload {
                                source_ip: src.ip().to_string(),
                                sdp_content: sdp_content.to_string(),
                            }).ok();
                        }
                    }
                }
                Err(_) => {}
            }
        }

        // Cleanup
        for ip in &interface_ips {
            if let Ok(iface_addr) = ip.parse::<Ipv4Addr>() {
                socket.leave_multicast_v4(&sap_addr, &iface_addr).ok();
            }
        }
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
    let mut args = vec!["interface", "ip", "set", "address", interface_name.as_str()];

    if is_dhcp {
        args.push("dhcp");
    } else {
        if let (Some(ip_addr), Some(mask_addr)) = (ip.as_deref(), mask.as_deref()) {
            args.push("static");
            args.push(ip_addr);
            args.push(mask_addr);
        } else {
            return Err("IP and Mask are required for static configuration".to_string());
        }
    }
    
    cmd.args(args);

    match cmd.output() {
        Ok(output) => {
            println!("Sortie netsh : {:?}", output);
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
