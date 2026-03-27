import { useState } from "react";
import { ChevronRight, ChevronDown, Monitor, Rss } from "lucide-react";
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
    <div className="flex flex-col h-full bg-zinc-950/20 border-r border-zinc-800 w-64 lg:w-80 shrink-0">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rss size={18} className="text-green-400" />
          <h2 className="font-semibold text-zinc-100 uppercase tracking-wider text-sm">Streams</h2>
        </div>
        <span className="bg-zinc-800 text-zinc-500 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
          {devices.reduce((acc, d) => acc + d.streams.length, 0)} detected
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {devices.length === 0 ? (
          <div className="px-4 py-20 text-center text-zinc-600 text-sm italic">
            No AES67 streams detected yet...
          </div>
        ) : (
          devices.map((device) => {
            const isExpanded = expandedDevices.includes(device.ip);
            return (
              <div key={device.ip} className="space-y-1">
                <button 
                  onClick={() => toggleDevice(device.ip)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-zinc-900 rounded-md transition-colors group mb-0.5"
                >
                  <div className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                    <ChevronRight size={14} className="text-zinc-600" />
                  </div>
                  <Monitor size={16} className="text-zinc-700 group-hover:text-zinc-400" />
                  <div className="flex flex-col items-start leading-tight min-w-0">
                    <span className="text-xs font-semibold text-zinc-300 truncate w-full">{device.name}</span>
                    <span className="text-[10px] text-zinc-600 font-mono italic">{device.ip}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="ml-4 space-y-0.5 border-l border-zinc-900 pl-2">
                    {device.streams.sort((a, b) => a.name.localeCompare(b.name)).map((stream) => (
                      <button 
                        key={stream.id}
                        onClick={() => onStreamSelect(stream)}
                        className={`w-full flex items-center gap-2 py-1.5 px-3 rounded-md text-[13px] transition-all ${
                          selectedStreamId === stream.id 
                            ? "bg-blue-600/10 text-blue-400 font-medium border-l-2 border-blue-500 rounded-l-none" 
                            : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                        }`}
                      >
                        <div className={`w-1 h-1 rounded-full ${
                          selectedStreamId === stream.id ? "bg-blue-400" : "bg-zinc-800"
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
