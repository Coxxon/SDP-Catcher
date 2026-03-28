import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { InterfaceList } from "./components/InterfaceList";
import { StreamTree } from "./components/StreamTree";
import { SdpViewer } from "./components/SdpViewer";

export interface Stream {
  id: string;
  name: string;
  multicastIp: string;
  sdpContent: string;
  lastSeen: number;
}

export interface Device {
  name: string;
  ip: string;
  streams: Stream[];
}

interface SdpDiscoveredEvent {
  source_ip: string;
  sdp_content: string;
}

export interface InterfaceInfo {
  name: string;
  ip: string;
  mask: string;
}

function App() {
  const [activeIp, setActiveIp] = useState<string | null>(null);
  const [isSniffing, setIsSniffing] = useState(false);
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);

  const parseSdp = (raw: string): { name: string; multicastIp: string; originIp: string; sessionInfo: string | null } => {
    const lines = raw.split(/\r?\n/);
    let name = "Unknown Stream";
    let multicastIp = "0.0.0.0";
    let originIp = "0.0.0.0";
    let sessionInfo: string | null = null;

    for (const line of lines) {
      if (line.startsWith("s=")) {
        name = line.substring(2).trim();
      } else if (line.startsWith("i=")) {
        sessionInfo = line.substring(2).trim();
      } else if (line.startsWith("c=IN IP4 ")) {
        const parts = line.substring(9).split("/");
        multicastIp = parts[0].trim();
      } else if (line.startsWith("o=")) {
        const parts = line.split(" ");
        if (parts.length >= 6) {
          originIp = parts[5].trim();
        }
      }
    }
    return { name, multicastIp, originIp, sessionInfo };
  };

  const refreshInterfaces = async () => {
    try {
      const ifaces = await invoke<InterfaceInfo[]>("get_network_interfaces");
      setInterfaces(ifaces);
      return ifaces;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  useEffect(() => {
    refreshInterfaces();
  }, []);

  // Global Sniffing Management
  const startGlobalSniffing = async (ifaces: InterfaceInfo[]) => {
    if (ifaces.length === 0) return;
    const ips = ifaces.map(i => i.ip);
    try {
      await invoke("start_sniffing", { interfaceIps: ips });
      setIsSniffing(true);
    } catch (err) {
      console.error("Failed to start global sniffing", err);
      setIsSniffing(false);
    }
  };

  useEffect(() => {
    if (interfaces.length > 0 && !isSniffing) {
        startGlobalSniffing(interfaces);
    }
  }, [interfaces]);

  useEffect(() => {
    const unlisten = listen<SdpDiscoveredEvent>("sdp-discovered", (event) => {
      console.log("📥 Évènement IPC reçu depuis Rust :", event.payload);
      const { sdp_content } = event.payload;
      const { name, multicastIp, originIp, sessionInfo } = parseSdp(sdp_content);

      if (originIp === "0.0.0.0") return;

      setDevices((prev) => {
        const timestamp = Date.now();
        const existingDeviceIndex = prev.findIndex((d) => d.ip === originIp);
        const deviceName = sessionInfo || `Device ${originIp}`;

        if (existingDeviceIndex >= 0) {
          const newDevices = [...prev];
          const device = { ...newDevices[existingDeviceIndex] };
          
          // Mémoriser/Mettre à jour le nom convivial si reçu
          device.name = deviceName;

          const existingStreamIndex = device.streams.findIndex((s) => s.name === name);

          if (existingStreamIndex >= 0) {
            device.streams[existingStreamIndex] = {
              ...device.streams[existingStreamIndex],
              sdpContent: sdp_content,
              multicastIp,
              lastSeen: timestamp,
            };
          } else {
            device.streams.push({
              id: `${originIp}-${name}`,
              name,
              multicastIp,
              sdpContent: sdp_content,
              lastSeen: timestamp,
            });
          }
          newDevices[existingDeviceIndex] = device;
          return newDevices;
        } else {
          return [
            ...prev,
            {
              name: deviceName,
              ip: originIp,
              streams: [
                {
                  id: `${originIp}-${name}`,
                  name,
                  multicastIp,
                  sdpContent: sdp_content,
                  lastSeen: timestamp,
                },
              ],
            },
          ];
        }
      });
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleInterfaceSelect = (ip: string) => {
    if (ip === activeIp) {
        setActiveIp(null);
    } else {
        setActiveIp(ip);
    }
    // No more stopping/starting here, sniffing is global
  };

  const filteredDevices = activeIp 
    ? (() => {
        const activeIface = interfaces.find(i => i.ip === activeIp);
        if (!activeIface) return devices;
        
        const ipToLong = (ip: string) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
        const m = ipToLong(activeIface.mask);
        const target = ipToLong(activeIface.ip) & m;
        
        return devices.filter(d => (ipToLong(d.ip) & m) === target);
      })()
    : devices;

  return (
    <main className="flex h-screen w-screen bg-neutral-900 text-neutral-300 font-sans antialiased overflow-hidden select-none">
      <InterfaceList
        activeIp={activeIp}
        isSniffing={isSniffing}
        interfaces={interfaces}
        devices={devices}
        onInterfaceSelect={handleInterfaceSelect}
        setIsSniffing={setIsSniffing}
        onRefreshInterfaces={refreshInterfaces}
        onStartSniffing={startGlobalSniffing}
      />
      <StreamTree
        devices={filteredDevices}
        onStreamSelect={setSelectedStream}
        selectedStreamId={selectedStream?.id || null}
      />
      <SdpViewer
        sdp={selectedStream?.sdpContent || null}
        sourceIp={selectedStream ? `${selectedStream.name} (${selectedStream.multicastIp})` : undefined}
      />
    </main>
  );
}

export default App;
