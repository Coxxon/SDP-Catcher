import { useState } from "react";
import { ChevronRight, Monitor, Rss } from "lucide-react";
import { Device, Stream } from "../App";

interface StreamTreeProps {
  devices: Device[];
  onStreamSelect: (stream: Stream) => void;
  selectedStreamId: string | null;
}

export function StreamTree({ devices, onStreamSelect, selectedStreamId }: StreamTreeProps) {
  const [expandedDevices, setExpandedDevices] = useState<string[]>([]);

  const toggleDevice = (ip: string) => {
    setExpandedDevices((prev) =>
      prev.includes(ip) ? prev.filter((i) => i !== ip) : [...prev, ip]
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#121316] border-r border-[#1E1F22] w-72 lg:w-80 shrink-0">
      <div className="p-4 border-b border-[#1E1F22] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rss size={18} className="text-[#3B82F6]" />
          <h2 className="variant-header text-white">Streams</h2>
        </div>
        <span className="bg-[#1E1F22] text-[#8B949E] text-[10px] px-1.5 py-0.5 rounded-full font-mono">
          {devices.reduce((acc, d) => acc + d.streams.length, 0)} detected
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {devices.length === 0 ? (
          <div className="px-4 py-20 text-center text-[#8B949E] text-xs italic">
            Waiting for SAP announcements...
          </div>
        ) : (
          devices.map((device) => {
            const isExpanded = expandedDevices.includes(device.ip);
            return (
              <div key={device.ip} className="space-y-0.5">
                <button
                  onClick={() => toggleDevice(device.ip)}
                  className="w-full flex items-center gap-2 p-2 bg-[#0B0C0E]/40 hover:bg-[#1E1F22] rounded-md transition-all group"
                >
                  <div className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                    <ChevronRight size={14} className="text-[#8B949E]" />
                  </div>
                  <Monitor size={16} className="text-[#3B82F6] opacity-50 group-hover:opacity-100" />
                  <div className="flex flex-col items-start leading-none min-w-0">
                    <span className="text-[11px] font-bold text-white truncate w-full uppercase tracking-tight">{device.name}</span>
                    <span className="text-[9px] text-[#8B949E] font-mono italic">{device.ip}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="ml-3 space-y-0.5 border-l border-[#1E1F22] pl-2 py-1">
                    {device.streams.sort((a, b) => a.name.localeCompare(b.name)).map((stream) => (
                      <button
                        key={stream.id}
                        onClick={() => onStreamSelect(stream)}
                        className={`w-full flex items-center gap-3 py-1.5 px-3 rounded-md text-[12px] transition-all ${
                          selectedStreamId === stream.id
                            ? "bg-[#3B82F6]/10 text-[#3B82F6] font-semibold"
                            : "text-[#8B949E] hover:text-white hover:bg-[#1E1F22]/60"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          selectedStreamId === stream.id ? "bg-[#3B82F6] shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-transparent border border-[#1E1F22]"
                        }`} />
                        <span className="truncate">{stream.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
