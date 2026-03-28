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

  const handleStreamClick = (stream: Stream) => {
    console.log("Stream cliqué :", stream.name);
    onStreamSelect(stream);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-r border-neutral-700 w-72 lg:w-80 shrink-0">
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Rss size={14} className="text-neutral-400" />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight">Streams</h2>
        </div>
        <span className="bg-neutral-600 text-neutral-100 font-bold px-2 py-0.5 rounded-md text-xs">
          {devices.reduce((acc, d) => acc + d.streams.length, 0)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-0 space-y-0">
        {devices.length === 0 ? (
          <div className="p-4 text-center text-neutral-600 text-xs italic">
            Scanning for SAP...
          </div>
        ) : (
          devices.map((device) => {
            const isExpanded = expandedDevices.includes(device.ip);
            return (
              <div key={device.ip} className="border-b border-neutral-800/50">
                <button
                  onClick={() => toggleDevice(device.ip)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-neutral-800/20 hover:bg-neutral-800 transition-all group"
                >
                  <div className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                    <ChevronRight size={14} className="text-neutral-600" />
                  </div>
                  <Monitor size={14} className="text-neutral-500 group-hover:text-neutral-300" />
                  <div className="flex flex-col items-start leading-none min-w-0">
                    <span className="text-[11px] font-bold text-neutral-200 truncate w-full tracking-tight">{device.name}</span>
                    <span className="text-xs text-zinc-500 font-mono mt-0.5">{device.ip}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-0 bg-black/10">
                    {device.streams.sort((a, b) => a.name.localeCompare(b.name)).map((stream) => (
                      <button
                        key={stream.id}
                        onClick={() => handleStreamClick(stream)}
                        className={`w-full flex flex-col items-start py-2 px-8 text-[12px] transition-all border-b border-neutral-800/30 ${
                          selectedStreamId === stream.id
                            ? "bg-neutral-700 text-white font-bold"
                            : "text-zinc-500 hover:text-zinc-200 hover:bg-neutral-800"
                        }`}
                      >
                         <span className={`truncate w-full text-left ${selectedStreamId === stream.id ? 'text-white' : 'text-zinc-300'}`}>
                           {stream.name}
                         </span>
                         <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                           {stream.multicastIp}
                         </span>
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
