import { useState } from "react";
import { ChevronRight, ChevronDown, Monitor, Rss } from "lucide-react";

interface Stream {
  id: string;
  name: string;
}

interface Device {
  name: string;
  ip: string;
  streams: Stream[];
}

const mockDevices: Device[] = [
  {
    name: "Redundant Core A",
    ip: "192.168.10.101",
    streams: [
      { id: "1", name: "Main LR Out" },
      { id: "2", name: "Aux 1-2" }
    ]
  },
  {
    name: "Desk 1 Feed",
    ip: "192.168.10.102",
    streams: [
      { id: "3", name: "Mic Pre 01" }
    ]
  }
];

export function StreamTree() {
  const [expandedDevices, setExpandedDevices] = useState<string[]>(mockDevices.map(d => d.ip));

  const toggleDevice = (ip: string) => {
    setExpandedDevices(prev => 
      prev.includes(ip) ? prev.filter(i => i !== ip) : [...prev, ip]
    );
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800 w-64 lg:w-80 shrink-0">
      <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
        <Rss size={18} className="text-green-400" />
        <h2 className="font-semibold text-zinc-100 uppercase tracking-wider text-sm">Streams</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {mockDevices.map((device) => {
          const isExpanded = expandedDevices.includes(device.ip);
          return (
            <div key={device.ip} className="space-y-1">
              <button 
                onClick={() => toggleDevice(device.ip)}
                className="w-full flex items-center gap-2 p-2 hover:bg-zinc-800/50 rounded-md transition-colors group"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Monitor size={16} className="text-zinc-500 group-hover:text-zinc-300" />
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-medium text-zinc-200">{device.name}</span>
                  <span className="text-[10px] text-zinc-600 font-mono">{device.ip}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="ml-6 space-y-1 border-l border-zinc-900">
                  {device.streams.map((stream) => (
                    <button 
                      key={stream.id}
                      className="w-full flex items-center gap-2 py-2 px-3 hover:bg-zinc-800/30 rounded-md text-sm text-zinc-400 hover:text-blue-400 transition-colors"
                    >
                      <div className="w-1 h-1 rounded-full bg-zinc-700" />
                      {stream.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
