mod manufacturer;

use serde::Serialize;
use std::net::{UdpSocket, Ipv4Addr};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use manufacturer::identify_manufacturer;

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
    mac: String,
    manufacturer: String,
    sap_timeout_ms: u64,
}

#[derive(Serialize, Clone)]
struct PtpPayload {
    name: String,
    ip: String,
}

#[derive(Serialize)]
struct DeviceInfo {
    ip: String,
    name: String,
}

pub struct AppState {
    sniffer_stop_flag: Mutex<Option<Arc<AtomicBool>>>,
    default_unknown_timeout_s: Mutex<u64>,
}

fn get_mac_from_arp(ip: &str) -> (String, String) {
    // We use a global scan 'arp -a' for maximum reliability across Windows versions
    let output = std::process::Command::new("arp")
        .arg("-a")
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            
            // Standard Windows ARP output has IP at index 0 and MAC at index 1
            if parts.len() >= 2 {
                let entry_ip = parts[0];
                let entry_mac = parts[1];
                
                // Strict IP match
                if entry_ip == ip {
                    let mac = entry_mac.replace("-", ":").to_uppercase();
                    let oui = mac.split(':').take(3).collect::<Vec<_>>().join("");
                    println!("🎯 [ARP] Match: IP {} -> MAC {} (OUI {})", ip, mac, oui);
                    return (mac, oui);
                }
            }
        }
    }
    
    // Diagnostic log for unreachable devices
    println!("⚠️ [ARP] No entry found in system table for IP {}", ip);
    ("Unknown".to_string(), "Unknown".to_string())
}

#[tauri::command]
fn get_network_interfaces() -> Vec<NetworkInterface> {
    use std::collections::HashMap;
    let mut interfaces_map: HashMap<String, NetworkInterface> = HashMap::new();
    
    for iface in netdev::get_interfaces() {
        if iface.is_loopback() { continue; }
        let name = iface.friendly_name.clone().unwrap_or(iface.name.clone());
        
        for ipv4 in iface.ipv4 {
            let ip = ipv4.addr.to_string();
            let mask = ipv4.netmask.to_string();
            
            let new_iface = NetworkInterface {
                name: name.clone(),
                ip: ip.clone(),
                mask,
            };

            if let Some(existing) = interfaces_map.get(&name) {
                // If existing is Zeroconf and new is NOT, replace it
                if existing.ip.starts_with("169.254") && !ip.starts_with("169.254") {
                    interfaces_map.insert(name.clone(), new_iface);
                }
            } else {
                interfaces_map.insert(name.clone(), new_iface);
            }
        }
    }
    
    let mut result: Vec<NetworkInterface> = interfaces_map.into_values().collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

#[tauri::command]
fn start_sniffing(app: AppHandle, interface_ips: Vec<String>, state: State<'_, AppState>) {
    println!("🚀 Commande Rust reçue : Démarrage global SDP & PTP sur {} interfaces", interface_ips.len());
    
    let mut stop_flag_lock = state.sniffer_stop_flag.lock().unwrap();
    if let Some(old_flag) = stop_flag_lock.take() {
        old_flag.store(true, Ordering::Relaxed);
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    *stop_flag_lock = Some(Arc::clone(&stop_flag));
    drop(stop_flag_lock);

    let default_unknown_timeout_s = *state.default_unknown_timeout_s.lock().unwrap();

    thread::spawn(move || {
        let sap_addr = Ipv4Addr::new(239, 255, 255, 255);
        let ptp_addr = Ipv4Addr::new(224, 0, 1, 129);
        let sap_port = 9875;
        let ptp_port = 320;

        let mut sap_socket = None;
        let mut ptp_socket = None;

        // Try binding SAP
        for _ in 0..5 {
             if stop_flag.load(Ordering::Relaxed) { return; }
             if let Ok(s) = UdpSocket::bind(("0.0.0.0", sap_port)) {
                 s.set_read_timeout(Some(Duration::from_millis(500))).ok();
                 for ip in &interface_ips {
                     if let Ok(iface_addr) = ip.parse::<Ipv4Addr>() {
                         s.join_multicast_v4(&sap_addr, &iface_addr).ok();
                     }
                 }
                 sap_socket = Some(s);
                 break;
             }
             thread::sleep(Duration::from_secs(1));
        }

        // Try binding PTP
        for _ in 0..5 {
             if stop_flag.load(Ordering::Relaxed) { return; }
             if let Ok(s) = UdpSocket::bind(("0.0.0.0", ptp_port)) {
                 s.set_read_timeout(Some(Duration::from_millis(500))).ok();
                 for ip in &interface_ips {
                     if let Ok(iface_addr) = ip.parse::<Ipv4Addr>() {
                         s.join_multicast_v4(&ptp_addr, &iface_addr).ok();
                     }
                 }
                 ptp_socket = Some(s);
                 break;
             }
             thread::sleep(Duration::from_secs(1));
        }

        let sap_socket = match sap_socket { Some(s) => s, None => return };
        let ptp_socket = match ptp_socket { Some(s) => s, None => return };

        // Spawn PTP thread
        let stop_flag_ptp = Arc::clone(&stop_flag);
        let app_ptp = app.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while !stop_flag_ptp.load(Ordering::Relaxed) {
                if let Ok((size, _)) = ptp_socket.recv_from(&mut buf) {
                    let payload = String::from_utf8_lossy(&buf[..size]);
                    if payload.starts_with("PTP_MOCK|") {
                        let parts: Vec<&str> = payload.split('|').collect();
                        if parts.len() >= 3 {
                            app_ptp.emit("ptp-clock-update", PtpPayload {
                                name: parts[1].to_string(),
                                ip: parts[2].to_string(),
                            }).ok();
                        }
                    }
                }
            }
        });

        // Main thread handles SAP
        let mut buf = [0u8; 4096];
        while !stop_flag.load(Ordering::Relaxed) {
            if let Ok((size, src)) = sap_socket.recv_from(&mut buf) {
                let payload = &buf[..size];
                // Localise le début du SDP (v=0)
                if let Some(pos) = payload.windows(3).position(|w| w == b"v=0") {
                    if let Ok(sdp_content) = std::str::from_utf8(&payload[pos..]) {
                        
                        // On extrait l'IP d'origine spécifiée dans le SDP (o=...)
                        // car en simulation locale, l'IP UDP source est toujours 127.0.0.1 ou l'IP du PC.
                        let mut origin_ip = src.ip().to_string();
                        for line in sdp_content.lines() {
                            if line.starts_with("o=") {
                                let parts: Vec<&str> = line.split_whitespace().collect();
                                if parts.len() >= 6 {
                                    origin_ip = parts[5].to_string();
                                    break;
                                }
                            }
                        }

                        let (mac, _oui) = get_mac_from_arp(&origin_ip);
                        let mfr_enum = identify_manufacturer(&mac);
                        let mfr_name = mfr_enum.to_string();
                        let timeout = mfr_enum.default_timeout_ms(default_unknown_timeout_s);

                        app.emit("sdp-discovered", SdpPayload {
                            source_ip: origin_ip, // On utilise l'IP simulée pour la UI également
                            sdp_content: sdp_content.to_string(),
                            mac,
                            manufacturer: mfr_name,
                            sap_timeout_ms: timeout,
                        }).ok();
                    }
                }
            }
        }
    });
}

#[tauri::command]
fn stop_sniffing(state: State<'_, AppState>) {
    let mut stop_flag_lock = state.sniffer_stop_flag.lock().unwrap();
    if let Some(old_flag) = stop_flag_lock.take() {
        old_flag.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
fn set_unknown_timeout(seconds: u64, state: State<'_, AppState>) {
    // Clamping 60-300 as per requirements
    let clamped = seconds.clamp(60, 300);
    let mut lock = state.default_unknown_timeout_s.lock().unwrap();
    *lock = clamped;
}

#[tauri::command]
fn set_network_ip(interface_name: String, is_dhcp: bool, ip: Option<String>, mask: Option<String>) -> Result<String, String> {
    let mut cmd = std::process::Command::new("netsh");
    let mut args = vec!["interface", "ip", "set", "address", interface_name.as_str()];
    if is_dhcp {
        args.push("dhcp");
    } else {
        if let (Some(ip_addr), Some(mask_addr)) = (ip.as_deref(), mask.as_deref()) {
            args.push("static"); args.push(ip_addr); args.push(mask_addr);
        } else {
            return Err("IP and Mask are required".to_string());
        }
    }
    cmd.args(args);
    match cmd.output() {
        Ok(out) => if out.status.success() { Ok("OK".to_string()) } else { Err(String::from_utf8_lossy(&out.stderr).to_string()) },
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_arp_table() -> std::collections::HashMap<String, DeviceInfo> {
    use std::collections::HashMap;
    let mut table = HashMap::new();
    
    // Inject mock entries for simulator (standard PTP IDs -> IP + Name)
    let mock_names = vec!["GM-Clock-Antenna", "Lawo-Core-Primary", "Axia-Console-StudioA", "Riedel-Switch-01", "Yamaha-Rivage-FOH"];
    for i in 121..170 {
        let mac = format!("00:11:22:88:88:{:02X}", i);
        let ip = format!("192.168.1.{}", i);
        let name = mock_names[i % mock_names.len()].to_string();
        table.insert(mac, DeviceInfo { ip, name });
    }

    // Specialized PTP Topology Mocks (Riedel/Luminex)
    table.insert("00:10:5F:AA:BB:CC".to_string(), DeviceInfo { 
        ip: "192.168.1.10".to_string(), 
        name: "Riedel-Artist-GMC".to_string() 
    });
    table.insert("00:D0:BB:11:22:33".to_string(), DeviceInfo { 
        ip: "192.168.1.50".to_string(), 
        name: "Luminex-BC-Switch".to_string() 
    });

    let output = std::process::Command::new("arp")
        .arg("-a")
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let ip = parts[0];
                let mac = parts[1].replace("-", ":").to_uppercase();
                if mac.split(':').count() == 6 {
                    table.entry(mac).or_insert(DeviceInfo {
                        ip: ip.to_string(),
                        name: "---".to_string(),
                    });
                }
            }
        }
    }
    table
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState { 
            sniffer_stop_flag: Mutex::new(None),
            default_unknown_timeout_s: Mutex::new(60),
        })
        .invoke_handler(tauri::generate_handler![
            get_network_interfaces, 
            get_arp_table,
            start_sniffing, 
            stop_sniffing, 
            set_network_ip,
            set_unknown_timeout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
