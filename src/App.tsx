import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { InterfaceList } from "./components/InterfaceList";
import { StreamTree } from "./components/StreamTree";
import { SdpViewer } from "./components/SdpViewer";

function App() {
  const [activeIp, setActiveIp] = useState<string | null>(null);
  const [selectedSdp, setSelectedSdp] = useState<string | null>(null);

  const handleInterfaceSelect = async (ip: string) => {
    setActiveIp(ip);
    try {
      // Invoke the Rust backend to start sniffing on the selected interface
      await invoke("start_sniffing", { interfaceIp: ip });
      console.log(`Sniffing started on ${ip}`);
    } catch (err) {
      console.error("Failed to start sniffing", err);
    }
  };

  return (
    <main className="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {/* Col 1: Interfaces */}
      <InterfaceList 
        activeIp={activeIp} 
        onInterfaceSelect={handleInterfaceSelect} 
      />
      
      {/* Col 2: Streams (Tree View) */}
      <StreamTree />
      
      {/* Col 3: SDP Viewer */}
      <SdpViewer sdp={selectedSdp} />
    </main>
  );
}

export default App;
