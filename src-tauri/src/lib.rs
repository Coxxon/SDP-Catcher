mod manufacturer;

use serde::Serialize;
use std::net::{Ipv4Addr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

use manufacturer::identify_manufacturer;
use pnet::datalink::{self, Channel};
use pnet::packet::ethernet::{EtherTypes, EthernetPacket};
use pnet::packet::Packet;
use socket2::{Domain, Protocol, Socket, Type};
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
    ptp_id: String,
    name: String,
    ip: String,
    interface_ip: String,
    domain: u8,
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
    device_timeout_modes: Mutex<HashMap<String, bool>>,
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
        let sap_port = 9875;

        let mut sap_socket = None;

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

        let sap_socket = match sap_socket {
            Some(s) => s,
            None => return,
        };

        // Spawn LLDP/PTP Sniffer thread
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
                            
                            // LLDP (0x88CC)
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

        // Spawn Global PTP Socket thread for IGMP membership and capture
        let stop_flag_ptp = Arc::clone(&stop_flag);
        let app_ptp = app.clone();
        let discovery_ptp = Arc::clone(&discovery_table_arc);
        let selected_ips = interface_ips.clone();

        thread::spawn(move || {
            let ptp_addr = Ipv4Addr::new(224, 0, 1, 129);
            let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP));
            if let Ok(socket) = socket {
                socket.set_reuse_address(true).expect("Failed to set SO_REUSEADDR");
                #[cfg(not(windows))]
                socket.set_reuse_port(true).expect("Failed to set SO_REUSEPORT");
                
                socket.set_multicast_loop_v4(true).expect("Failed to set IP_MULTICAST_LOOP"); // CRITICAL for simulator

                if socket.bind(&"0.0.0.0:320".parse::<std::net::SocketAddr>().unwrap().into()).is_ok() {
                    let interfaces = netdev::get_interfaces();
                    let mut subnets = Vec::new();

                    for ip_str in &selected_ips {
                        if let Ok(iface_addr) = ip_str.parse::<Ipv4Addr>() {
                            socket.join_multicast_v4(&ptp_addr, &iface_addr).ok();
                        }
                        
                        // Cache subnet info for matching
                        for iface in &interfaces {
                            for ipv4 in &iface.ipv4 {
                                if ipv4.addr.to_string() == *ip_str {
                                    let ip_u32 = u32::from_be_bytes(ipv4.addr.octets());
                                    let mask_u32 = u32::from_be_bytes(ipv4.netmask.octets());
                                    subnets.push((ip_str.clone(), ip_u32, mask_u32));
                                }
                            }
                        }
                    }

                    let udp_socket: std::net::UdpSocket = socket.into();
                    udp_socket.set_read_timeout(Some(Duration::from_millis(500))).ok();

                    let mut buf = [0u8; 1024];
                    while !stop_flag_ptp.load(Ordering::Relaxed) {
                        if let Ok((size, src)) = udp_socket.recv_from(&mut buf) {
                            let payload = &buf[..size];
                            if payload.len() >= 44 && payload[0] & 0x0F == 0x0B {
                                let domain = payload[4];
                                let clock_id = &payload[20..28];
                                let ptp_id = clock_id.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join("-");
                                let source_ip = src.ip().to_string();

                                // Determine the interface_ip by subnet matching
                                let mut matched_interface = String::new();
                                if let std::net::IpAddr::V4(src_v4) = src.ip() {
                                    let src_u32 = u32::from_be_bytes(src_v4.octets());
                                    for (iface_ip, ip_u32, mask_u32) in &subnets {
                                        if (src_u32 & mask_u32) == (*ip_u32 & mask_u32) {
                                            matched_interface = iface_ip.clone();
                                            break;
                                        }
                                    }
                                }
                                
                                // Default fallback to first targeted interface if match fails
                                if matched_interface.is_empty() && !selected_ips.is_empty() {
                                    matched_interface = selected_ips[0].clone();
                                }

                                let mut table = discovery_ptp.lock().unwrap();
                                let (name, final_ip) = if let Some(info) = table.get(&ptp_id) {
                                    (info.name.clone(), info.ip.clone())
                                } else if let Some(info) = table.get(&source_ip) {
                                    (info.name.clone(), info.ip.clone())
                                } else {
                                    ("---".to_string(), source_ip.clone())
                                };

                                app_ptp.emit("ptp-clock-update", PtpPayload {
                                    ptp_id,
                                    name,
                                    ip: final_ip,
                                    interface_ip: matched_interface,
                                    domain,
                                }).ok();
                            }
                        }
                    }
                }
            }
        });

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
                        let mut ptp_id_from_sdp = String::new();

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
                            } else if line.starts_with("a=ts-refclk:ptp=IEEE1588-2008:") {
                                let parts: Vec<&str> = line.split(':').collect();
                                if parts.len() >= 3 {
                                    ptp_id_from_sdp = parts[2].to_uppercase();
                                }
                            }
                        }

                        // Use s= if available (best for broadcast streams), otherwise i=
                        let best_name = if stream_name != "---" && !stream_name.is_empty() {
                            stream_name
                        } else {
                            sap_name
                        };

                        let (mac, _oui) = get_mac_from_arp(&origin_ip);
                        let key = if mac != "Unknown" { mac.clone() } else { origin_ip.clone() };

                        {
                            let mut table = discovery_sap.lock().unwrap();
                            let entry = table.entry(key.clone()).or_insert(DeviceInfo {
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
                                app.emit("discovery-update", (key.clone(), entry.clone()))
                                    .ok();
                            }
                        }

                        if !ptp_id_from_sdp.is_empty() {
                            let mut table = discovery_sap.lock().unwrap();
                            table.insert(ptp_id_from_sdp.clone(), DeviceInfo {
                                ip: origin_ip.clone(),
                                name: best_name.clone(),
                            });
                            app.emit("discovery-update", (ptp_id_from_sdp.clone(), DeviceInfo { ip: origin_ip.clone(), name: best_name.clone() })).ok();
                        }

                        let mfr_enum = identify_manufacturer(&mac);
                        
                        // Dynamically retrieve the latest state for this IP specifically to allow hot-toggling without app restart
                        let use_global = {
                            let state = app.state::<AppState>();
                            let map = state.device_timeout_modes.lock().unwrap();
                            map.get(&origin_ip).copied().unwrap_or(false)
                        };

                        let sap_timeout_ms = if use_global {
                            default_unknown_timeout_s * 1000
                        } else {
                            mfr_enum.default_timeout_ms(default_unknown_timeout_s)
                        };

                        app.emit(
                            "sdp-discovered",
                            SdpPayload {
                                source_ip: origin_ip,
                                sdp_content: sdp_content.to_string(),
                                mac,
                                manufacturer: mfr_enum.to_string(),
                                sap_timeout_ms,
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

#[tauri::command]
fn set_window_constraints(window: tauri::Window, collapsed: bool, zoom_level: f64) {
    let base_min_width = if collapsed { 609.0 } else { 800.0 };
    let min_width = base_min_width * zoom_level;
    let min_height = 600.0 * zoom_level;
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(min_width, min_height)));
    
    if let Ok(current_size) = window.inner_size() {
        if let Ok(scale_factor) = window.scale_factor() {
            let logical_size = current_size.to_logical::<f64>(scale_factor);
            if logical_size.width < min_width {
                let _ = window.set_size(tauri::LogicalSize::new(min_width, logical_size.height));
            }
        }
    }
}

#[tauri::command]
fn set_device_timeout_mode(ip: String, use_default: bool, state: State<'_, AppState>) {
    let mut map = state.device_timeout_modes.lock().unwrap();
    map.insert(ip, use_default);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(AppState {
            sniffer_stop_flag: Mutex::new(None),
            default_unknown_timeout_s: Mutex::new(60),
            discovery_table: Arc::new(Mutex::new(HashMap::new())),
            device_timeout_modes: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_network_interfaces,
            get_arp_table,
            start_sniffing,
            stop_sniffing,
            set_network_ip,
            set_unknown_timeout,
            set_window_constraints,
            set_device_timeout_mode
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(Some(tauri::Theme::Dark));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
