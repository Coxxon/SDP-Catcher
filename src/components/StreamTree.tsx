import { useState, useRef, useEffect } from "react";
import { Rss, ChevronRight, HardDrive, Trash2, ChevronsUpDown, ChevronsDownUp, Search, X } from "lucide-react";
import { Stream, Device } from "../App";

import { manufacturerLogos } from "./ManufacturerLogos";

interface StreamTreeProps {
  devices: Device[];
  onStreamSelect: (stream: Stream) => void;
  selectedStreamId: string | null;
  onClearOffline?: () => void;
  isSniffing: boolean;
}

export function StreamTree({ devices, onStreamSelect, selectedStreamId, onClearOffline, isSniffing }: StreamTreeProps) {
  const [expandedDevices, setExpandedDevices] = useState<string[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const filteredDevices = devices.reduce((acc: Device[], device) => {
    const q = searchQuery.toLowerCase();
    
    // Check if the device itself matches the query
    const deviceMatch = 
      device.name.toLowerCase().includes(q) ||
      device.ip.toLowerCase().includes(q) ||
      device.mac.toLowerCase().includes(q) ||
      device.manufacturer.toLowerCase().includes(q);

    if (deviceMatch) {
      acc.push(device);
      return acc;
    }

    // If the device doesn't match, check if any of its streams do
    const matchingStreams = device.streams.filter(s => 
      s.name.toLowerCase().includes(q) || 
      s.multicastIp.toLowerCase().includes(q)
    );

    if (matchingStreams.length > 0) {
      acc.push({ ...device, streams: matchingStreams });
    }
    
    return acc;
  }, []);

  const isAllExpanded = filteredDevices.length > 0 && filteredDevices.every(d => expandedDevices.includes(d.ip));

  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedDevices([]);
    } else {
      setExpandedDevices(filteredDevices.map(d => d.ip));
    }
  };

  const toggleDevice = (ip: string) => {
    setExpandedDevices((prev: string[]) =>
      prev.includes(ip) ? prev.filter((i: string) => i !== ip) : [...prev, ip]
    );
  };

  const handleStreamClick = (stream: Stream) => {
    onStreamSelect(stream);
  };

  const isStreamOnline = (stream: Stream) => Date.now() - stream.lastSeen <= stream.sapTimeoutMs;

  const getStreamStatus = (stream: Stream) => {
    if (!isSniffing) return "standby";
    return isStreamOnline(stream) ? "online" : "offline";
  };

  const getDeviceStatus = (device: Device) => {
    if (!isSniffing) return "standby";
    const statuses = device.streams.map(s => isStreamOnline(s));
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
    <div className="flex flex-col h-full bg-neutral-900 border-r border-neutral-700 w-[15.9375rem] min-w-[15.9375rem] max-w-[15.9375rem] shrink-0">
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 flex items-center justify-between px-3 relative overflow-hidden">
        
        {/* Animated Search Bar Overlay */}
        <div 
          className={`absolute inset-0 z-10 flex items-center px-3 bg-zinc-950 transition-all duration-300 ease-in-out origin-right ${
            isSearchOpen ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0 pointer-events-none'
          }`}
        >
          <Search size="0.875rem" className="text-neutral-500 shrink-0" />
          <input 
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsSearchOpen(false);
                setSearchQuery('');
              } else if (e.key === 'Enter' && !searchQuery) {
                setIsSearchOpen(false);
              }
            }}
            placeholder="Search streams..."
            className="flex-1 bg-transparent px-2 text-xs text-neutral-200 focus:outline-none min-w-0 font-sans"
          />
          <button 
            onClick={() => {
              if (searchQuery) setSearchQuery('');
              else setIsSearchOpen(false);
            }}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors shrink-0"
          >
            <X size="0.875rem" />
          </button>
        </div>

        {/* Normal Header Content */}
        <div className="flex items-center gap-2">
          <Rss size="0.875rem" className="text-neutral-400" />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight">Streams</h2>
          <span className="text-neutral-500 font-bold px-1 py-0.5 text-xs">
            {filteredDevices.reduce((acc, d) => acc + d.streams.length, 0)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsSearchOpen(true)}
            title="Search streams"
            className="p-1.5 rounded-md hover:bg-neutral-700 text-neutral-500 hover:text-neutral-200 transition-all font-sans"
          >
            <Search size="0.875rem" />
          </button>
          <button
            onClick={toggleAll}
            title={isAllExpanded ? "Tout replier" : "Tout déplier"}
            className="p-1.5 rounded-md hover:bg-neutral-700 text-neutral-500 hover:text-neutral-200 transition-all font-sans"
          >
            {isAllExpanded ? <ChevronsDownUp size="0.875rem" /> : <ChevronsUpDown size="0.875rem" />}
          </button>
          <button
            onClick={onClearOffline}
            title="Supprimer les flux hors-ligne"
            className="p-1.5 rounded-md hover:bg-neutral-700 text-neutral-500 hover:text-red-400 transition-all font-sans"
          >
            <Trash2 size="0.875rem" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-0 space-y-0">
        {devices.length === 0 ? (
          <div className="p-4 text-center text-neutral-600 text-xs italic">
            Scanning for SAP...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-4 flex flex-col items-center gap-2 text-center text-neutral-500 mt-4">
            <Search size="1.25rem" className="opacity-50" />
            <span className="text-xs italic">No results found</span>
          </div>
        ) : (
          [...filteredDevices].sort((a, b) => a.name.localeCompare(b.name)).map((device) => {
            const isExpanded = expandedDevices.includes(device.ip);
            const status = getDeviceStatus(device);
            const statusClass = getStatusClasses(status);

            return (
              <div key={device.ip} className="border-b border-neutral-800/50">
                <button
                  onClick={() => toggleDevice(device.ip)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-neutral-950 hover:bg-neutral-900 transition-all group relative overflow-hidden"
                >
                  <div className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                    <ChevronRight size="0.875rem" className="text-neutral-600" />
                  </div>
                  <div className="relative pointer-events-none">
                    <HardDrive size="0.875rem" className="text-neutral-500 group-hover:text-neutral-300" />
                    <div className={`absolute -top-1 -right-1 w-2 h-2 ${statusClass}`} />
                  </div>

                  <div className="relative z-10 flex flex-col items-start leading-none min-w-0 text-left">
                    <span className="text-[0.6875rem] font-bold text-neutral-200 truncate w-full tracking-tight pb-0.5">{device.name}</span>
                    <span className="text-xs text-zinc-500 font-mono mt-0.5">{device.ip}</span>
                  </div>

                  {/* Background Ghost Logo */}
                  {manufacturerLogos[device.manufacturer.split(' (')[0]] && (
                    <div className="absolute top-0 right-0 h-full w-24 opacity-[0.40] text-neutral-600 pointer-events-none z-0 flex items-center justify-end pr-2 overflow-hidden">
                      {manufacturerLogos[device.manufacturer.split(' (')[0]]}
                    </div>
                  )}
                </button>

                {isExpanded && (
                  <div className="space-y-0 bg-black/10">
                    {/* Device Meta Info */}
                    <div className="px-8 py-2 bg-black/20 border-y border-white/5 shadow-inner flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[0.5625rem] text-neutral-500 uppercase font-bold tracking-wider whitespace-nowrap">Manufacturer</span>
                        <span className={`text-[0.625rem] whitespace-nowrap ${device.manufacturer === 'Unknown' ? 'text-neutral-600 italic' : 'text-neutral-200 font-bold'}`}>
                          {device.manufacturer.split(' (')[0]}
                          {device.manufacturer === 'Unknown' && ' (fallback)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[0.5625rem] text-neutral-500 uppercase font-bold tracking-wider whitespace-nowrap">SAP Timeout</span>
                        <span className="text-[0.625rem] text-neutral-200 font-mono whitespace-nowrap">
                          {device.sapTimeoutMs / 1000}s
                          {device.manufacturer === 'Unknown' && ' (user-defined)'}
                        </span>
                      </div>
                    </div>

                    {[...device.streams].sort((a, b) => a.name.localeCompare(b.name)).map((stream) => {
                      const streamStatus = getStreamStatus(stream);
                      const streamStatusClass = getStatusClasses(streamStatus);

                      return (
                        <button
                          key={stream.id}
                          onClick={() => handleStreamClick(stream)}
                          className={`w-full flex flex-col items-start py-2 px-8 text-[0.75rem] transition-all border-b border-neutral-800/30 ${selectedStreamId === stream.id
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
