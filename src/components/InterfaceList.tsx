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
    <div className="flex flex-col h-full bg-[#121316] border-r border-[#1E1F22] w-64 lg:w-72 shrink-0">
      <div className="p-4 border-b border-[#1E1F22] flex items-center gap-3">
        <Network size={20} className="text-[#3B82F6]" />
        <h2 className="variant-header text-white">Interfaces</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
        {interfaces.length === 0 ? (
          <div className="px-3 py-4 text-[#8B949E] text-xs italic">
            Scanning network interfaces...
          </div>
        ) : (
          interfaces.map((iface) => {
            const isActive = activeIp === iface.ip;
            return (
              <button
                key={iface.ip}
                onClick={() => onInterfaceSelect(iface.ip)}
                className={`w-full text-left p-3 transition-all rounded-r-lg group border-l-[3px] ${
                  isActive
                    ? "bg-[#1E1F22] border-[#3B82F6] text-white"
                    : "hover:bg-[#1E1F22]/40 text-[#8B949E] border-transparent"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${isActive ? "text-white" : "group-hover:text-zinc-300"}`}>
                    {iface.name}
                  </span>
                  {isActive && <Activity size={10} className="text-[#3B82F6] animate-pulse" />}
                </div>
                <div className="text-[10px] font-mono opacity-80 flex gap-2">
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
