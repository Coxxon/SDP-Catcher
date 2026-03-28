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
    <div className="flex flex-col h-full bg-neutral-900 border-r border-neutral-700 w-64 lg:w-72 shrink-0">
      <div className="bg-neutral-800 p-3 border-b border-neutral-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-neutral-400" />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight">Interfaces</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {interfaces.length === 0 ? (
          <div className="p-3 text-neutral-600 text-[11px] italic">
            Scanning...
          </div>
        ) : (
          interfaces.map((iface) => {
            const isActive = activeIp === iface.ip;
            return (
              <button
                key={iface.ip}
                onClick={() => onInterfaceSelect(iface.ip)}
                className={`w-full text-left px-3 py-2 transition-all border-b border-neutral-800/50 flex flex-col gap-0.5 ${
                  isActive
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:bg-neutral-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate tracking-tight">{iface.name}</span>
                  {isActive && <Activity size={10} className="text-blue-400 animate-pulse" />}
                </div>
                <div className="text-[10px] font-mono opacity-50 flex gap-2">
                  <span>{iface.ip}</span>
                  <span>{iface.mask}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
