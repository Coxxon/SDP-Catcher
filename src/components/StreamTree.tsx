import { useState } from "react";
import { ChevronRight, HardDrive, Rss, Trash2 } from "lucide-react";
import { Device, Stream } from "../App";

interface StreamTreeProps {
  devices: Device[];
  onStreamSelect: (stream: Stream) => void;
  selectedStreamId: string | null;
  onClearOffline?: () => void;
  isSniffing: boolean;
}

export function StreamTree({ devices, onStreamSelect, selectedStreamId, onClearOffline, isSniffing }: StreamTreeProps) {
  const [expandedDevices, setExpandedDevices] = useState<string[]>([]);

  const toggleDevice = (ip: string) => {
    setExpandedDevices((prev) =>
      prev.includes(ip) ? prev.filter((i) => i !== ip) : [...prev, ip]
    );
  };

  const handleStreamClick = (stream: Stream) => {
    onStreamSelect(stream);
  };

  const isStreamOnline = (lastSeen: number) => Date.now() - lastSeen <= 15000;

  const getStreamStatus = (stream: Stream) => {
    if (!isSniffing) return "standby";
    return isStreamOnline(stream.lastSeen) ? "online" : "offline";
  };

  const getDeviceStatus = (device: Device) => {
    if (!isSniffing) return "standby";
    const statuses = device.streams.map(s => isStreamOnline(s.lastSeen));
    const allOnline = statuses.every(s => s === true);
    const allOffline = statuses.every(s => s === false);
    
    if (allOnline) return "online";
    if (allOffline) return "offline";
    return "partial";
  };

  const getStatusClasses = (status: string) => {
    const base = "rounded-full aspect-square block";
    switch (status) {
      case "online":
        return `${base} bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.35)]`;
      case "offline":
        return `${base} bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.35)]`;
      case "standby":
        return `${base} bg-orange-500 shadow-[0_0_4px_rgba(249,115,22,0.35)]`;
      case "partial":
        return `${base} bg-orange-500 shadow-[0_0_4px_rgba(249,115,22,0.35)] animate-blink`;
      default:
        return `${base} bg-neutral-600 opacity-50`;
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-r border-neutral-700 w-72 lg:w-80 shrink-0">
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Rss size={14} className="text-neutral-400" />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight">Streams</h2>
          <span className="text-neutral-500 font-bold px-1 py-0.5 text-xs">
            {devices.reduce((acc, d) => acc + d.streams.length, 0)}
          </span>
        </div>
        <button 
            onClick={onClearOffline}
            title="Supprimer les flux hors-ligne"
            className="p-1.5 rounded-md hover:bg-neutral-700 text-neutral-500 hover:text-red-400 transition-all font-sans"
        >
            <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-0 space-y-0">
        {devices.length === 0 ? (
          <div className="p-4 text-center text-neutral-600 text-xs italic">
            Scanning for SAP...
          </div>
        ) : (
          devices.map((device) => {
            const isExpanded = expandedDevices.includes(device.ip);
            const status = getDeviceStatus(device);
            const statusClass = getStatusClasses(status);

            return (
              <div key={device.ip} className="border-b border-neutral-800/50">
                <button
                  onClick={() => toggleDevice(device.ip)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-neutral-950 hover:bg-neutral-900 transition-all group"
                >
                  <div className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                    <ChevronRight size={14} className="text-neutral-600" />
                  </div>
                  <div className="relative pointer-events-none">
                    <HardDrive size={14} className="text-neutral-500 group-hover:text-neutral-300" />
                    <div className={`absolute -top-1 -right-1 w-2 h-2 ${statusClass}`} />
                  </div>
                  <div className="flex flex-col items-start leading-none min-w-0 text-left">
                    <span className="text-[11px] font-bold text-neutral-200 truncate w-full tracking-tight">{device.name}</span>
                    <span className="text-xs text-zinc-500 font-mono mt-0.5">{device.ip}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-0 bg-black/10">
                    {device.streams.sort((a, b) => a.name.localeCompare(b.name)).map((stream) => {
                      const streamStatus = getStreamStatus(stream);
                      const streamStatusClass = getStatusClasses(streamStatus);

                      return (
                        <button
                          key={stream.id}
                          onClick={() => handleStreamClick(stream)}
                          className={`w-full flex flex-col items-start py-2 px-8 text-[12px] transition-all border-b border-neutral-800/30 ${
                            selectedStreamId === stream.id
                              ? "bg-neutral-800 text-white font-bold"
                              : "text-zinc-500 hover:text-zinc-200 hover:bg-neutral-800/40"
                          }`}
                        >
                           <div className="flex items-center gap-2 w-full">
                              <div className={`w-1.5 h-1.5 ${streamStatusClass}`} />
                              <span className={`truncate flex-1 text-left ${selectedStreamId === stream.id ? 'text-white' : 'text-zinc-300'}`}>
                                {stream.name}
                              </span>
                           </div>
                           <span className="text-xs text-zinc-500 font-mono mt-0.5 pl-3.5">
                             {stream.multicastIp}
                           </span>
                        </button>
                      );
                    })}
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
