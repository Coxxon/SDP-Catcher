mod manufacturer;

use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

use manufacturer::identify_manufacturer;
use pcap::Device;
use pnet::packet::ethernet::{EtherTypes, EthernetPacket};
use pnet::packet::ip::IpNextHeaderProtocols;
use pnet::packet::ipv4::Ipv4Packet;
use pnet::packet::udp::UdpPacket;
use pnet::packet::vlan::VlanPacket;
use pnet::packet::Packet;
use dns_parser::{Packet as DnsPacket, RData};
use socket2::{Domain, Protocol, Socket, Type};
use std::collections::HashMap;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Deserialize, Clone)]
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
    let mut cmd = std::process::Command::new("arp");
    cmd.arg("-a");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let output = cmd.output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let entry_ip = parts[0];
                let entry_mac = parts[1];
                if entry_ip == ip {
                    let mac = entry_mac.replace("-", ":").to_uppercase();
                    let oui = mac.split(':').take(3).collect::<Vec<_>>().join("");
                    return (mac, oui);
                }
            }
        }
    }
    ("Unknown".to_string(), "Unknown".to_string())
}

#[tauri::command]
fn get_network_interfaces() -> Vec<NetworkInterface> {
    let mut interfaces_map: HashMap<String, NetworkInterface> = HashMap::new();
    for iface in netdev::get_interfaces() {
        if iface.is_loopback() { continue; }
        let name = iface.friendly_name.clone().unwrap_or(iface.name.clone());
        for ipv4 in iface.ipv4 {
            let ip = ipv4.addr.to_string();
            let new_iface = NetworkInterface {
                name: name.clone(),
                ip: ip.clone(),
                mask: ipv4.netmask.to_string(),
            };
            if let Some(existing) = interfaces_map.get(&name) {
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
fn start_sniffing(app: AppHandle, selected_interfaces: Vec<NetworkInterface>, state: State<'_, AppState>) {
    let mut stop_flag_lock = state.sniffer_stop_flag.lock().unwrap();
    if let Some(old_flag) = stop_flag_lock.take() {
        old_flag.store(true, Ordering::Relaxed);
    }
    let stop_flag = Arc::new(AtomicBool::new(false));
    *stop_flag_lock = Some(Arc::clone(&stop_flag));
    drop(stop_flag_lock);

    let default_unknown_timeout_s = *state.default_unknown_timeout_s.lock().unwrap();
    let discovery_table_arc = Arc::clone(&state.discovery_table);

    // Un thread par interface pour la capture LLDP, SAP et mDNS via pcap
    for network_interface in &selected_interfaces {
        let stop_flag_node = Arc::clone(&stop_flag);
        let discovery_node = Arc::clone(&discovery_table_arc);
        let app_node = app.clone();
        let target_name = network_interface.name.clone();
        let target_ip = network_interface.ip.clone();

        thread::spawn(move || {
            let mut mdns_cache: HashMap<String, String> = HashMap::new();
            let mut target_npf_name = String::new();

            // 1. Traduction : Trouver le vrai GUID Npcap via pnet::datalink
            for pnet_iface in pnet::datalink::interfaces() {
                let has_ip = pnet_iface.ips.iter().any(|ip| ip.ip().to_string() == target_ip);
                let desc_match = pnet_iface.description == target_name;
                
                if has_ip || desc_match {
                    target_npf_name = pnet_iface.name.clone();
                    break;
                }
            }

            if target_npf_name.is_empty() {
                eprintln!("⚠️ ÉCHEC : Impossible de traduire l'interface {} ({}) en GUID matériel.", target_name, target_ip);
                return;
            }

            // 2. Accroche pcap
            let pcap_devices = pcap::Device::list().unwrap_or_default();
            let device = match pcap_devices.into_iter().find(|d| d.name == target_npf_name) {
                Some(d) => d,
                None => {
                    eprintln!("⚠️ ÉCHEC CRITIQUE : pcap ne trouve pas le matériel NPF : {}", target_npf_name);
                    return;
                }
            };

            // Ouverture façon Wireshark
            let mut cap = pcap::Capture::from_device(device)
                .unwrap()
                .promisc(true)
                .snaplen(65535)
                .timeout(100)
                .open()
                .expect("Erreur fatale lors de l'ouverture du handle pcap");

            while !stop_flag_node.load(Ordering::Relaxed) {
                match cap.next_packet() {
                    Ok(packet) => {
                        if let Some(eth) = EthernetPacket::new(packet.data) {
                            let mut current_ethertype = eth.get_ethertype();
                            let mut current_payload = eth.payload();
                            let vlan_holder;

                            if current_ethertype == EtherTypes::Vlan {
                                vlan_holder = VlanPacket::new(current_payload);
                                if let Some(ref vlan) = vlan_holder {
                                    current_ethertype = vlan.get_ethertype();
                                    current_payload = vlan.payload();
                                } else { continue; }
                            } else { vlan_holder = None; }

                            if current_ethertype == EtherTypes::Lldp {
                                if let Some((mac, name, ip)) = parse_lldp(current_payload) {
                                    let mut table = discovery_node.lock().unwrap();
                                    let entry = table.entry(mac.clone()).or_insert(DeviceInfo { ip: ip.clone(), name: name.clone() });
                                    if entry.ip != ip || entry.name != name {
                                        entry.ip = ip;
                                        entry.name = name;
                                        app_node.emit("discovery-update", (mac, entry.clone())).ok();
                                    }
                                }
                            } 
                            else if current_ethertype == EtherTypes::Ipv4 {
                                if let Some(ipv4) = Ipv4Packet::new(current_payload) {
                                    if ipv4.get_next_level_protocol() == IpNextHeaderProtocols::Udp {
                                        if let Some(udp) = UdpPacket::new(ipv4.payload()) {
                                            let dest_port = udp.get_destination();
                                            let src_port = udp.get_source();

                                            // --- 1. BRANCHE SAP (9875) ---
                                            if dest_port == 9875 {
                                                let sap_payload = udp.payload();
                                                if let Some(pos) = sap_payload.windows(3).position(|w| w == b"v=0") {
                                                    let sdp_bytes = &sap_payload[pos..];
                                                    let sdp_content = String::from_utf8_lossy(sdp_bytes).to_string();
                                                    
                                                    let mut origin_ip = ipv4.get_source().to_string();
                                                    let mut sap_name = "---".to_string();
                                                    let mut stream_name = "---".to_string();
                                                    let mut ptp_id_from_sdp = String::new();

                                                    for line in sdp_content.lines() {
                                                        let line = line.trim();
                                                        if line.starts_with("o=") {
                                                            let parts: Vec<&str> = line.split_whitespace().collect();
                                                            if parts.len() >= 6 && parts[5] != "0.0.0.0" { origin_ip = parts[5].to_string(); }
                                                        } else if line.starts_with("s=") {
                                                            stream_name = line[2..].trim().to_string();
                                                        } else if line.starts_with("i=") {
                                                            sap_name = line[2..].trim().to_string();
                                                        } else if line.starts_with("a=ts-refclk:ptp=IEEE1588-2008:") {
                                                            let parts: Vec<&str> = line.split(':').collect();
                                                            if parts.len() >= 3 { ptp_id_from_sdp = parts[2].to_uppercase(); }
                                                        }
                                                    }

                                                    let best_name = if !stream_name.is_empty() && stream_name != "---" { stream_name } else { sap_name };
                                                    let (mac, _oui) = get_mac_from_arp(&origin_ip);
                                                    let key = if mac != "Unknown" { mac.clone() } else { origin_ip.clone() };

                                                    // Résolution mDNS Priority
                                                    let final_device_name = if let Some(mdns_name) = mdns_cache.get(&origin_ip) {
                                                        mdns_name.clone()
                                                    } else {
                                                        best_name.clone()
                                                    };

                                                    {
                                                        let mut table = discovery_node.lock().unwrap();
                                                        let entry = table.entry(key.clone()).or_insert(DeviceInfo { ip: origin_ip.clone(), name: final_device_name.clone() });
                                                        if entry.ip != origin_ip || (final_device_name != "---" && entry.name != final_device_name) {
                                                            entry.ip = origin_ip.clone();
                                                            if final_device_name != "---" { entry.name = final_device_name.clone(); }
                                                            app_node.emit("discovery-update", (key.clone(), entry.clone())).ok();
                                                        }

                                                        if !ptp_id_from_sdp.is_empty() {
                                                            table.insert(ptp_id_from_sdp.clone(), DeviceInfo { ip: origin_ip.clone(), name: final_device_name.clone() });
                                                            app_node.emit("discovery-update", (ptp_id_from_sdp.clone(), DeviceInfo { ip: origin_ip.clone(), name: final_device_name.clone() })).ok();
                                                        }
                                                    }

                                                    let mut mfr_enum = if !ptp_id_from_sdp.is_empty() { identify_manufacturer(&ptp_id_from_sdp) } else { manufacturer::Manufacturer::Unknown };
                                                    if mfr_enum == manufacturer::Manufacturer::Unknown { mfr_enum = identify_manufacturer(&mac); }
                                                    
                                                    let use_global = {
                                                        let state = app_node.state::<AppState>();
                                                        let map = state.device_timeout_modes.lock().unwrap();
                                                        map.get(&origin_ip).copied().unwrap_or(false)
                                                    };

                                                    let sap_timeout_ms = if use_global { default_unknown_timeout_s * 1000 } else { mfr_enum.default_timeout_ms(default_unknown_timeout_s) };

                                                    app_node.emit("sdp-discovered", SdpPayload {
                                                        source_ip: origin_ip,
                                                        sdp_content: sdp_content.to_string(),
                                                        mac,
                                                        manufacturer: mfr_enum.to_string(),
                                                        sap_timeout_ms,
                                                    }).ok();
                                                }
                                            } 
                                            // --- 2. BRANCHE mDNS (5353) ---
                                            else if dest_port == 5353 || src_port == 5353 {
                                                if let Ok(dns_packet) = DnsPacket::parse(udp.payload()) {
                                                    for answer in dns_packet.answers {
                                                        if let RData::A(ip_record) = answer.data {
                                                            let ip_str = ip_record.0.to_string();
                                                            let clean_name = answer.name.to_string().replace(".local", "");
                                                            
                                                            if !clean_name.is_empty() {
                                                                mdns_cache.insert(ip_str.clone(), clean_name.clone());
                                                                
                                                                let mut table = discovery_node.lock().unwrap();
                                                                for (key, entry) in table.iter_mut() {
                                                                    if entry.ip == ip_str && entry.name != clean_name {
                                                                        entry.name = clean_name.clone();
                                                                        app_node.emit("discovery-update", (key.clone(), entry.clone())).ok();
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    Err(pcap::Error::TimeoutExpired) => continue,
                    Err(e) => { eprintln!("ERREUR pcap.next_packet : {}", e); }
                }
            }
        });
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
fn get_arp_table(state: State<'_, AppState>) -> HashMap<String, DeviceInfo> {
    let mut table = state.discovery_table.lock().unwrap().clone();
    let mut cmd = std::process::Command::new("arp");
    cmd.arg("-a");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    if let Ok(out) = cmd.output() {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let ip = parts[0];
                let mac = parts[1].replace("-", ":").to_uppercase();
                if mac.split(':').count() == 6 {
                    table.entry(mac).or_insert(DeviceInfo { ip: ip.to_string(), name: "---".to_string() });
                }
            }
        }
    }
    table
}

#[tauri::command]
fn set_unknown_timeout(seconds: u64, state: State<'_, AppState>) {
    let clamped = seconds.clamp(60, 300);
    let mut lock = state.default_unknown_timeout_s.lock().unwrap();
    *lock = clamped;
}

#[tauri::command]
fn set_network_ip(interface_name: String, is_dhcp: bool, ip: Option<String>, mask: Option<String>) -> Result<String, String> {
    let mut cmd = std::process::Command::new("netsh");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let mut args = vec!["interface", "ip", "set", "address", interface_name.as_str()];
    if is_dhcp { args.push("dhcp"); }
    else if let (Some(ip_addr), Some(mask_addr)) = (ip.as_deref(), mask.as_deref()) {
        args.push("static"); args.push(ip_addr); args.push(mask_addr);
    } else { return Err("IP and Mask are required".to_string()); }
    cmd.args(args);
    match cmd.output() {
        Ok(out) => { if out.status.success() { Ok("OK".to_string()) } else { Err(String::from_utf8_lossy(&out.stderr).to_string()) } }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_window_constraints(window: tauri::Window, collapsed: bool, zoom_level: f64) {
    let base_min_width = if collapsed { 609.0 } else { 800.0 };
    let min_width = base_min_width * zoom_level;
    let min_height = 600.0 * zoom_level;
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(min_width, min_height)));
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
        .plugin(tauri_plugin_opener::init())
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
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(800.0, 600.0)));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
        if pos + tlv_len > packet.len() { break; }
        let value = &packet[pos..pos + tlv_len];
        match tlv_type {
            1 => { if tlv_len >= 7 && value[0] == 4 { chassis_id = value[1..7].iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(":"); } }
            5 => system_name = String::from_utf8_lossy(value).to_string(),
            8 => { if tlv_len >= 5 && value[1] == 1 { mgmt_ip = value[2..6].iter().map(|b| b.to_string()).collect::<Vec<_>>().join("."); } }
            0 => break,
            _ => {}
        }
        pos += tlv_len;
    }
    if !chassis_id.is_empty() { Some((chassis_id, system_name, mgmt_ip)) } else { None }
}
