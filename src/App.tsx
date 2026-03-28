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

function App() {
  const [activeIp, setActiveIp] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);

  const parseSdp = (raw: string): { name: string; multicastIp: string } => {
    const lines = raw.split(/\r?\n/);
    let name = "Unknown Stream";
    let multicastIp = "0.0.0.0";

    for (const line of lines) {
      if (line.startsWith("s=")) {
        name = line.substring(2).trim();
      } else if (line.startsWith("c=IN IP4 ")) {
        const parts = line.substring(9).split("/");
        multicastIp = parts[0].trim();
      }
    }
    return { name, multicastIp };
  };

  useEffect(() => {
    const unlisten = listen<SdpDiscoveredEvent>("sdp-discovered", (event) => {
      const { source_ip, sdp_content } = event.payload;
      const { name, multicastIp } = parseSdp(sdp_content);

      setDevices((prev) => {
        const timestamp = Date.now();
        const existingDeviceIndex = prev.findIndex((d) => d.ip === source_ip);

        if (existingDeviceIndex >= 0) {
          const newDevices = [...prev];
          const device = { ...newDevices[existingDeviceIndex] };
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
              id: `${source_ip}-${name}`,
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
              name: `Device ${source_ip}`,
              ip: source_ip,
              streams: [
                {
                  id: `${source_ip}-${name}`,
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

  const handleInterfaceSelect = async (ip: string) => {
    setActiveIp(ip);
    setDevices([]);
    try {
      await invoke("start_sniffing", { interfaceIp: ip });
    } catch (err) {
      console.error("Failed to start sniffing", err);
    }
  };

  return (
    <main className="flex h-screen w-screen bg-neutral-900 text-neutral-300 font-sans antialiased overflow-hidden select-none">
      <InterfaceList
        activeIp={activeIp}
        onInterfaceSelect={handleInterfaceSelect}
      />
      <StreamTree
        devices={devices}
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
