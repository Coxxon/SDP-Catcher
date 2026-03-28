mod manufacturer;

use serde::Serialize;
use std::net::{Ipv4Addr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use manufacturer::identify_manufacturer;
use pnet::datalink::{self, Channel};
use pnet::packet::ethernet::{EtherTypes, EthernetPacket};
use pnet::packet::Packet;
use std::collections::HashMap;

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

#[derive(Serialize, Clone)]
struct DeviceInfo {
    ip: String,
    name: String,
}

pub struct AppState {
    sniffer_stop_flag: Mutex<Option<Arc<AtomicBool>>>,
    default_unknown_timeout_s: Mutex<u64>,
    discovery_table: Arc<Mutex<HashMap<String, DeviceInfo>>>,
}

fn get_mac_from_arp(ip: &str) -> (String, String) {
    // We use a global scan 'arp -a' for maximum reliability across Windows versions
    let output = std::process::Command::new("arp").arg("-a").output();

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
        if iface.is_loopback() {
            continue;
        }
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
    println!(
        "🚀 Commande Rust reçue : Démarrage global SDP & PTP sur {} interfaces",
        interface_ips.len()
    );

    let mut stop_flag_lock = state.sniffer_stop_flag.lock().unwrap();
    if let Some(old_flag) = stop_flag_lock.take() {
        old_flag.store(true, Ordering::Relaxed);
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    *stop_flag_lock = Some(Arc::clone(&stop_flag));
    drop(stop_flag_lock);

    let default_unknown_timeout_s = *state.default_unknown_timeout_s.lock().unwrap();
    let discovery_table_arc = Arc::clone(&state.discovery_table);

    thread::spawn(move || {
        let sap_addr = Ipv4Addr::new(239, 255, 255, 255);
        let ptp_addr = Ipv4Addr::new(224, 0, 1, 129);
        let sap_port = 9875;
        let ptp_port = 320;

        let mut sap_socket = None;
        let mut ptp_socket = None;

        // Try binding SAP
        for _ in 0..5 {
            if stop_flag.load(Ordering::Relaxed) {
                return;
            }
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
            if stop_flag.load(Ordering::Relaxed) {
                return;
            }
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

        let sap_socket = match sap_socket {
            Some(s) => s,
            None => return,
        };
        let ptp_socket = match ptp_socket {
            Some(s) => s,
            None => return,
        };

        // Spawn PTP thread with Gleaning
        let stop_flag_ptp = Arc::clone(&stop_flag);
        let app_ptp = app.clone();
        let discovery_ptp = Arc::clone(&discovery_table_arc);
        thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while !stop_flag_ptp.load(Ordering::Relaxed) {
                if let Ok((size, src)) = ptp_socket.recv_from(&mut buf) {
                    let source_ip = src.ip().to_string();
                    let payload = &buf[..size];

                    // PTP Gleaning: Extract ClockIdentity from Announce (offset 20 in header)
                    if payload.len() >= 44 && payload[0] & 0x0F == 0x0B {
                        // Announce Check
                        let clock_id = &payload[20..28];
                        let ptp_id = clock_id
                            .iter()
                            .map(|b| format!("{:02X}", b))
                            .collect::<Vec<_>>()
                            .join("-");

                        // Extract MAC from EUI-64 (00-11-22-FF-FE-33-44-55 -> 00:11:22:33:44:55)
                        let mac = format!(
                            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                            clock_id[0],
                            clock_id[1],
                            clock_id[2],
                            clock_id[5],
                            clock_id[6],
                            clock_id[7]
                        );

                        let mut table = discovery_ptp.lock().unwrap();
                        let mut updated = false;

                        {
                            let mac_entry = table.entry(mac.clone()).or_insert(DeviceInfo {
                                ip: source_ip.clone(),
                                name: "---".to_string(),
                            });
                            if mac_entry.ip != source_ip {
                                mac_entry.ip = source_ip.clone();
                                updated = true;
                            }
                        }

                        {
                            let ptp_entry = table.entry(ptp_id.clone()).or_insert(DeviceInfo {
                                ip: source_ip.clone(),
                                name: "---".to_string(),
                            });
                            if ptp_entry.ip != source_ip {
                                ptp_entry.ip = source_ip.clone();
                                updated = true;
                            }
                        }

                        if updated {
                            if let Some(mac_entry) = table.get(&mac) {
                                app_ptp
                                    .emit("discovery-update", (mac.clone(), mac_entry.clone()))
                                    .ok();
                            }
                        }

                        // Resolve Best Identifier for Footer (Name > IP > PTP ID)
                        let display_name = {
                            if let Some(info) = table.get(&ptp_id) {
                                if !info.name.is_empty() && info.name != "---" {
                                    info.name.clone()
                                } else if !info.ip.is_empty() {
                                    info.ip.clone()
                                } else {
                                    ptp_id.clone()
                                }
                            } else {
                                ptp_id.clone()
                            }
                        };

                        app_ptp.emit("ptp-clock-update", PtpPayload {
                            name: display_name,
                            ip: source_ip.clone(),
                        }).ok();
                    }
                }
            }
        });

        // Spawn LLDP Sniffer thread
        for ip in &interface_ips {
            let stop_flag_lldp = Arc::clone(&stop_flag);
            let discovery_lldp = Arc::clone(&discovery_table_arc);
            let app_lldp = app.clone();
            let target_ip = ip.clone();

            thread::spawn(move || {
                let interfaces = datalink::interfaces();
                let interface = interfaces.into_iter().find(|iface| {
                    iface
                        .ips
                        .iter()
                        .any(|ip_net| ip_net.ip().to_string() == target_ip)
                });

                if let Some(iface) = interface {
                    let (_, mut rx) = match datalink::channel(&iface, Default::default()) {
                        Ok(Channel::Ethernet(tx, rx)) => (tx, rx),
                        _ => return,
                    };

                    while !stop_flag_lldp.load(Ordering::Relaxed) {
                        if let Ok(packet) = rx.next() {
                            let eth = EthernetPacket::new(packet).unwrap();
                            if eth.get_ethertype() == EtherTypes::Lldp {
                                if let Some((mac, name, ip)) = parse_lldp(eth.payload()) {
                                    let mut table = discovery_lldp.lock().unwrap();
                                    let entry = table.entry(mac.clone()).or_insert(DeviceInfo {
                                        ip: ip.clone(),
                                        name: name.clone(),
                                    });
                                    if entry.ip != ip || entry.name != name {
                                        entry.ip = ip;
                                        entry.name = name;
                                        app_lldp
                                            .emit("discovery-update", (mac, entry.clone()))
                                            .ok();
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }

        // Main thread handles SAP with Gleaning
        let mut buf = [0u8; 4096];
        let discovery_sap = Arc::clone(&discovery_table_arc);
        while !stop_flag.load(Ordering::Relaxed) {
            if let Ok((size, src)) = sap_socket.recv_from(&mut buf) {
                let payload = &buf[..size];
                if let Some(pos) = payload.windows(3).position(|w| w == b"v=0") {
                    if let Ok(sdp_content) = std::str::from_utf8(&payload[pos..]) {
                        // SAP Gleaning: Prioritize 's=' for Stream/Device name, then 'i='
                        let mut origin_ip = src.ip().to_string();
                        let mut sap_name = "---".to_string();
                        let mut stream_name = "---".to_string();

                        for line in sdp_content.lines() {
                            if line.starts_with("o=") {
                                let parts: Vec<&str> = line.split_whitespace().collect();
                                if parts.len() >= 6 {
                                    origin_ip = parts[5].to_string();
                                }
                            } else if line.starts_with("s=") {
                                stream_name = line[2..].trim().to_string();
                            } else if line.starts_with("i=") {
                                sap_name = line[2..].trim().to_string();
                            }
                        }

                        // Use s= if available (best for broadcast streams), otherwise i=
                        let best_name = if stream_name != "---" && !stream_name.is_empty() {
                            stream_name
                        } else {
                            sap_name
                        };

                        let (mac, _oui) = get_mac_from_arp(&origin_ip);

                        if mac != "Unknown" {
                            let mut table = discovery_sap.lock().unwrap();
                            let entry = table.entry(mac.clone()).or_insert(DeviceInfo {
                                ip: origin_ip.clone(),
                                name: best_name.clone(),
                            });

                            if entry.ip != origin_ip
                                || (best_name != "---" && entry.name != best_name)
                            {
                                entry.ip = origin_ip.clone();
                                if best_name != "---" {
                                    entry.name = best_name.clone();
                                }
                                app.emit("discovery-update", (mac.clone(), entry.clone()))
                                    .ok();
                            }
                        }

                        let mfr_enum = identify_manufacturer(&mac);
                        app.emit(
                            "sdp-discovered",
                            SdpPayload {
                                source_ip: origin_ip,
                                sdp_content: sdp_content.to_string(),
                                mac,
                                manufacturer: mfr_enum.to_string(),
                                sap_timeout_ms: mfr_enum
                                    .default_timeout_ms(default_unknown_timeout_s),
                            },
                        )
                        .ok();
                    }
                }
            }
        }
    });
}

fn parse_lldp(packet: &[u8]) -> Option<(String, String, String)> {
    let mut pos = 0;
    let mut chassis_id = String::new();
    let mut system_name = String::new();
    let mut mgmt_ip = String::new();

    while pos + 2 <= packet.len() {
        let header = u16::from_be_bytes([packet[pos], packet[pos + 1]]);
        let tlv_type = (header >> 9) as u8;
        let tlv_len = (header & 0x01FF) as usize;
        pos += 2;
        if pos + tlv_len > packet.len() {
            break;
        }

        let value = &packet[pos..pos + tlv_len];
        match tlv_type {
            1 => {
                if tlv_len >= 7 && value[0] == 4 {
                    chassis_id = value[1..7]
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join(":");
                }
            }
            5 => system_name = String::from_utf8_lossy(value).to_string(),
            8 => {
                if tlv_len >= 5 && value[1] == 1 {
                    mgmt_ip = value[2..6]
                        .iter()
                        .map(|b| b.to_string())
                        .collect::<Vec<_>>()
                        .join(".");
                }
            }
            0 => break,
            _ => {}
        }
        pos += tlv_len;
    }
    if !chassis_id.is_empty() {
        Some((chassis_id, system_name, mgmt_ip))
    } else {
        None
    }
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
fn set_network_ip(
    interface_name: String,
    is_dhcp: bool,
    ip: Option<String>,
    mask: Option<String>,
) -> Result<String, String> {
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
            return Err("IP and Mask are required".to_string());
        }
    }
    cmd.args(args);
    match cmd.output() {
        Ok(out) => {
            if out.status.success() {
                Ok("OK".to_string())
            } else {
                Err(String::from_utf8_lossy(&out.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_arp_table(state: State<'_, AppState>) -> HashMap<String, DeviceInfo> {
    let mut table = state.discovery_table.lock().unwrap().clone();

    let output = std::process::Command::new("arp").arg("-a").output();

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
            discovery_table: Arc::new(Mutex::new(HashMap::new())),
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
