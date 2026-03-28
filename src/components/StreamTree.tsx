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
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800 w-72 lg:w-80 shrink-0">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rss size={16} className="text-zinc-500" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Streams</h2>
        </div>
        <span className="bg-zinc-900 text-zinc-600 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
          {devices.reduce((acc, d) => acc + d.streams.length, 0)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {devices.length === 0 ? (
          <div className="px-4 py-20 text-center text-zinc-600 text-xs italic">
            Waiting for SAP announcements...
          </div>
        ) : (
          devices.map((device) => {
            const isExpanded = expandedDevices.includes(device.ip);
            return (
              <div key={device.ip} className="space-y-1">
                <button
                  onClick={() => toggleDevice(device.ip)}
                  className="w-full flex items-center gap-2 p-2 bg-zinc-900/50 border border-zinc-800/50 rounded-md hover:bg-zinc-900 hover:border-zinc-700 transition-all group"
                >
                  <div className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                    <ChevronRight size={14} className="text-zinc-500" />
                  </div>
                  <Monitor size={14} className="text-zinc-500 group-hover:text-zinc-300" />
                  <div className="flex flex-col items-start leading-none min-w-0">
                    <span className="text-[11px] font-bold text-zinc-300 truncate w-full uppercase tracking-tight">{device.name}</span>
                    <span className="text-[9px] text-zinc-600 font-mono italic">{device.ip}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="ml-3 space-y-1 border-l border-zinc-800 pl-2 py-1">
                    {device.streams.sort((a, b) => a.name.localeCompare(b.name)).map((stream) => (
                      <button
                        key={stream.id}
                        onClick={() => onStreamSelect(stream)}
                        className={`w-full flex items-center gap-3 py-1.5 px-3 rounded-md text-[12px] transition-all border ${
                          selectedStreamId === stream.id
                            ? "bg-blue-900/20 border-blue-500 text-blue-400 font-bold border-l-2"
                            : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 border-transparent"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          selectedStreamId === stream.id ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-transparent border border-zinc-800"
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
