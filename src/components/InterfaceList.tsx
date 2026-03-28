import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Network, Activity, Settings } from "lucide-react";

interface InterfaceInfo {
  name: string;
  ip: string;
  mask: string;
}

interface InterfaceListProps {
  activeIp: string | null;
  onInterfaceSelect: (ip: string) => void;
}

const maskToCidr = (mask: string): number => {
  return mask.split('.').reduce((acc, octet) => acc + (Number(octet).toString(2).match(/1/g) || []).length, 0);
};

export function InterfaceList({ activeIp, onInterfaceSelect }: InterfaceListProps) {
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [hiddenInterfaces, setHiddenInterfaces] = useState<string[]>(() => {
    const saved = localStorage.getItem("hiddenInterfaces");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    invoke<InterfaceInfo[]>("get_network_interfaces")
      .then(setInterfaces)
      .catch(console.error);
  }, []);

  useEffect(() => {
    localStorage.setItem("hiddenInterfaces", JSON.stringify(hiddenInterfaces));
  }, [hiddenInterfaces]);

  const handleClick = (ip: string) => {
    if (isEditMode) {
      setHiddenInterfaces((prev) =>
        prev.includes(ip) ? prev.filter((i) => i !== ip) : [...prev, ip]
      );
    } else {
      console.log("Interface sélectionnée :", ip);
      onInterfaceSelect(ip);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-r border-neutral-700 w-64 lg:w-72 shrink-0">
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-neutral-400" />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight">Interfaces</h2>
        </div>
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          className={`p-1.5 rounded-md hover:bg-neutral-700 transition-all ${
            isEditMode ? "text-blue-400 bg-neutral-700" : "text-neutral-500"
          }`}
        >
          <Settings size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {interfaces.length === 0 ? (
          <div className="p-3 text-neutral-600 text-[11px] italic">
            Scanning...
          </div>
        ) : (
          interfaces
            .filter((iface) => isEditMode || !hiddenInterfaces.includes(iface.ip))
            .map((iface) => {
              const isActive = activeIp === iface.ip;
              const isHidden = hiddenInterfaces.includes(iface.ip);
              const cidr = maskToCidr(iface.mask);
              
              return (
                <button
                  key={iface.ip}
                  onClick={() => handleClick(iface.ip)}
                  className={`w-full text-left px-3 py-2 transition-all border-b border-neutral-800/50 flex flex-col gap-0.5 ${
                    isActive
                      ? "bg-neutral-700 text-white"
                      : "text-neutral-400 hover:bg-neutral-800"
                  } ${isHidden ? "opacity-30" : "opacity-100"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium truncate tracking-tight ${isActive ? 'text-white' : 'text-zinc-200'} ${isHidden ? 'line-through' : ''}`}>
                      {iface.name}
                    </span>
                    {isActive && <Activity size={10} className="text-blue-400 animate-pulse" />}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono flex gap-2">
                    <span>{iface.ip} <span className="opacity-60">/{cidr}</span></span>
                  </div>
                </button>
              );
            })
        )}
      </div>
    </div>
  );
}
