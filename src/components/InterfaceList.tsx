import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Network, Activity } from "lucide-react";

interface InterfaceInfo {
  name: string;
  ip: string;
  mask: string;
}

interface InterfaceListProps {
  activeIp: string | null;
  onInterfaceSelect: (ip: string) => void;
}

export function InterfaceList({ activeIp, onInterfaceSelect }: InterfaceListProps) {
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);

  useEffect(() => {
    invoke<InterfaceInfo[]>("get_interfaces")
      .then(setInterfaces)
      .catch(console.error);
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800 w-64 lg:w-72 shrink-0">
      <div className="p-4 flex items-center gap-3">
        <Network size={16} className="text-zinc-500" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Interfaces</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {interfaces.length === 0 ? (
          <div className="px-3 py-4 text-zinc-500 text-xs italic">
            Scanning network interfaces...
          </div>
        ) : (
          interfaces.map((iface) => {
            const isActive = activeIp === iface.ip;
            return (
              <button
                key={iface.ip}
                onClick={() => onInterfaceSelect(iface.ip)}
                className={`w-full text-left p-3 transition-all rounded-md border ${
                  isActive
                    ? "bg-blue-900/20 border-blue-500 text-blue-400 border-l-2"
                    : "bg-zinc-900/50 border-zinc-800/50 text-zinc-400 hover:bg-zinc-900 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold truncate">
                    {iface.name}
                  </span>
                  {isActive && <Activity size={10} className="animate-pulse" />}
                </div>
                <div className="text-[10px] font-mono opacity-60 flex gap-2">
                  <span>{iface.ip}</span>
                  <span className="opacity-40">{iface.mask}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
