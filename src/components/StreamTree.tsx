import { useState, useRef, useEffect } from "react";
import { Rss, ChevronRight, HardDrive, Trash2, ChevronsUpDown, ChevronsDownUp, Search, X, ArrowUpDown } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Stream, Device } from "../App";

import { manufacturerLogos } from "./ManufacturerLogos";

interface StreamTreeProps {
  devices: Device[];
  onStreamSelect: (stream: Stream) => void;
  selectedStreamId: string | null;
  onClearOffline?: () => void;
  isSniffing: boolean;
  globalTimeout: number;
}

export function StreamTree({ devices, onStreamSelect, selectedStreamId, onClearOffline, isSniffing, globalTimeout }: StreamTreeProps) {
  const [expandedDevices, setExpandedDevices] = useState<string[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'ip'>('name');
  const [useDefaultTimeout, setUseDefaultTimeout] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const originalTimeouts = useRef<Record<string, number>>({});

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleTimeoutToggle = async (ip: string) => {
    const newState = !useDefaultTimeout[ip];
    setUseDefaultTimeout(prev => ({ ...prev, [ip]: newState }));
    try {
      await invoke('set_device_timeout_mode', { ip, useDefault: newState });
    } catch (e) {
      console.error("Failed to sync timeout mode with backend", e);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isSearchOpen &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node) &&
        !searchQuery
      ) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen, searchQuery]);

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
  }, [] as Device[]);

  const ipToNumber = (ip: string) => {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  };

  const sortedDevices = [...filteredDevices].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else {
      return ipToNumber(a.ip) - ipToNumber(b.ip);
    }
  });

  const isAllExpanded = sortedDevices.length > 0 && sortedDevices.every(d => expandedDevices.includes(d.ip));

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

  const getStatusClasses = (status: string, isGhost?: boolean) => {
    const base = "rounded-full aspect-square block";
    if (isGhost) return `${base} bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.4)] animate-ghost-pulse`;

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
          ref={searchContainerRef}
          className={`absolute inset-0 z-10 flex items-center px-3 bg-zinc-950 transition-transform duration-300 ease-in-out origin-right ${
            isSearchOpen ? 'scale-x-100' : 'scale-x-0 pointer-events-none'
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
        <div className={`flex items-center gap-2 transition-opacity duration-300 ${isSearchOpen ? 'opacity-0 duration-100' : 'opacity-100 delay-150'}`}>
          <Rss size="0.875rem" className="text-neutral-400" />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight">Streams</h2>
          <span className="text-neutral-500 font-bold px-1 py-0.5 text-xs">
            {sortedDevices.reduce((acc, d) => acc + d.streams.length, 0)}
          </span>
        </div>
        <div className={`flex items-center gap-1 transition-opacity duration-300 ${isSearchOpen ? 'opacity-0 duration-100' : 'opacity-100 delay-150'}`}>
          <button
            onClick={() => setIsSearchOpen(true)}
            title="Search"
            className="w-[26px] h-[26px] flex items-center justify-center rounded-md hover:bg-neutral-700 text-neutral-500 hover:text-neutral-200 transition-all font-sans shrink-0"
          >
            <Search size="0.875rem" />
          </button>
          <button
            onClick={() => setSortBy(prev => prev === 'name' ? 'ip' : 'name')}
            title={sortBy === 'name' ? 'Sort by IP address' : 'Sort alphabetically'}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-md hover:bg-neutral-700 text-neutral-500 hover:text-neutral-200 transition-all font-sans relative group shrink-0"
          >
            <ArrowUpDown size="0.875rem" />
            <span className="absolute bottom-1 right-1 text-[7px] font-bold text-neutral-500 group-hover:text-white transition-colors uppercase leading-none bg-neutral-800 group-hover:bg-neutral-700 px-[1px] py-[0.5px] rounded-[1px] shadow-[0_0_0_1px_var(--color-neutral-800)] group-hover:shadow-[0_0_0_1px_var(--color-neutral-700)]">
              {sortBy === 'name' ? 'AZ' : 'IP'}
            </span>
          </button>
          <button
            onClick={toggleAll}
            title={isAllExpanded ? "Collapse all" : "Expand all"}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-md hover:bg-neutral-700 text-neutral-500 hover:text-neutral-200 transition-all font-sans shrink-0"
          >
            {isAllExpanded ? <ChevronsDownUp size="0.875rem" /> : <ChevronsUpDown size="0.875rem" />}
          </button>
          <button
            onClick={onClearOffline}
            title="Clear offline devices/streams"
            className="w-[26px] h-[26px] flex items-center justify-center rounded-md hover:bg-neutral-700 text-neutral-500 hover:text-red-400 transition-all font-sans shrink-0"
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
        ) : sortedDevices.length === 0 ? (
          <div className="p-4 flex flex-col items-center gap-2 text-center text-neutral-500 mt-4">
            <Search size="1.25rem" className="opacity-50" />
            <span className="text-xs italic">No results found</span>
          </div>
        ) : (
          sortedDevices.map((device) => {
            const isExpanded = expandedDevices.includes(device.ip);
            const status = getDeviceStatus(device);
            const statusClass = getStatusClasses(status, device.isGhost);

            // Optimistic UI cache for immediate response without waiting for backend network packet sync
            if (!originalTimeouts.current[device.ip]) {
              originalTimeouts.current[device.ip] = device.sapTimeoutMs / 1000;
            }
            const displayedTimeoutMs = useDefaultTimeout[device.ip]
              ? globalTimeout
              : originalTimeouts.current[device.ip];

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
                      <div
                        onClick={() => handleTimeoutToggle(device.ip)}
                        className="flex items-center justify-between group/sap h-4.5 cursor-pointer transition-colors"
                      >
                        <span className="text-[0.5625rem] text-neutral-500 uppercase font-bold tracking-wider whitespace-nowrap transition-colors">
                          SAP Timeout {useDefaultTimeout[device.ip] ? "(DEFAULT)" : ""}
                        </span>

                        <span className="text-[0.625rem] text-neutral-200 font-mono whitespace-nowrap transition-colors">
                          {displayedTimeoutMs}s
                        </span>
                      </div>
                    </div>

                    {[...device.streams].sort((a, b) => a.name.localeCompare(b.name)).map((stream) => {
                      const streamStatus = getStreamStatus(stream);
                      const streamStatusClass = getStatusClasses(streamStatus, stream.isGhost);

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
