import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Network, Activity } from "lucide-react";

interface NetworkInterface {
  name: String;
  ip: String;
  mask: String;
}

interface InterfaceListProps {
  onInterfaceSelect: (ip: string) => void;
  activeIp: string | null;
}

export function InterfaceList({ onInterfaceSelect, activeIp }: InterfaceListProps) {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInterfaces() {
      try {
        const data = await invoke<NetworkInterface[]>("get_network_interfaces");
        setInterfaces(data);
      } catch (err) {
        console.error("Failed to fetch interfaces", err);
      } finally {
        setLoading(false);
      }
    }
    fetchInterfaces();
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950/50 border-r border-zinc-800 w-64 lg:w-72 shrink-0">
      <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
        <Network size={18} className="text-blue-400" />
        <h2 className="font-semibold text-zinc-100 uppercase tracking-wider text-sm">Interfaces</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {loading ? (
          <div className="px-4 py-8 text-center text-zinc-500 text-sm italic">
            Scanning interfaces...
          </div>
        ) : (
          interfaces.map((iface) => {
            const isActive = activeIp === String(iface.ip);
            return (
              <button
                key={String(iface.ip)}
                onClick={() => onInterfaceSelect(String(iface.ip))}
                className={`w-full text-left p-3 rounded-lg transition-all group ${
                  isActive 
                    ? "bg-blue-600/20 border border-blue-500/50" 
                    : "hover:bg-zinc-800 border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium text-sm ${isActive ? "text-blue-400" : "text-zinc-200"}`}>
                    {iface.name}
                  </span>
                  {isActive && <Activity size={14} className="text-blue-400 animate-pulse" />}
                </div>
                <div className="text-xs text-zinc-500 font-mono">
                  {iface.ip}
                  <span className="opacity-50 ml-1">({iface.mask})</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
