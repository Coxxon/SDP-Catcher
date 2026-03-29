import { useState, useRef, useEffect, useMemo } from "react";
import { Rss, ChevronRight, HardDrive, Trash2, ChevronsUpDown, ChevronsDownUp, Search, X, ArrowDownAZ } from "lucide-react";
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
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isFocusVisible, setIsFocusVisible] = useState(false);
  const focusTimer = useRef<any>(null);

  const ipToNumber = (ip: string) => {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  };

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

  const sortedDevices = useMemo(() => {
    return [...filteredDevices].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        return ipToNumber(a.ip) - ipToNumber(b.ip);
      }
    });
  }, [filteredDevices, sortBy]);

  const visibleItems = useMemo(() => {
    const items: { id: string; type: 'device' | 'stream'; device: Device; stream?: Stream }[] = [];
    sortedDevices.forEach(device => {
      items.push({ id: device.ip, type: 'device', device });
      if (expandedDevices.includes(device.ip)) {
        [...device.streams].sort((a, b) => a.name.localeCompare(b.name)).forEach(stream => {
          items.push({ id: stream.id, type: 'stream', device, stream });
        });
      }
    });
    return items;
  }, [sortedDevices, expandedDevices]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with typing in search input except for Escape/Enter already handled
      if (document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          // Allow starting navigation from search
          searchInputRef.current?.blur();
        } else {
          return;
        }
      }

      if (visibleItems.length === 0) return;

      const currentIndex = visibleItems.findIndex(item => item.id === focusedId);

      // Fonction dédiée pour déclencher le chrono UNIQUEMENT au clavier
      const triggerKeyboardFocus = () => {
        setIsFocusVisible(true);
        if (focusTimer.current) clearTimeout(focusTimer.current);
        focusTimer.current = setTimeout(() => setIsFocusVisible(false), 2000);
      };

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex === -1 || currentIndex === visibleItems.length - 1) {
            setFocusedId(visibleItems[0].id);
          } else {
            setFocusedId(visibleItems[currentIndex + 1].id);
          }
          triggerKeyboardFocus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex <= 0) {
            setFocusedId(visibleItems[visibleItems.length - 1].id);
          } else {
            setFocusedId(visibleItems[currentIndex - 1].id);
          }
          triggerKeyboardFocus();
          break;
        case 'ArrowRight':
          if (focusedId) {
            const item = visibleItems.find(i => i.id === focusedId);
            if (item?.type === 'device' && !expandedDevices.includes(item.id)) {
              e.preventDefault();
              toggleDevice(item.id);
            }
            triggerKeyboardFocus();
          }
          break;
        case 'ArrowLeft':
          if (focusedId) {
            const item = visibleItems.find(i => i.id === focusedId);
            if (item?.type === 'device' && expandedDevices.includes(item.id)) {
              e.preventDefault();
              toggleDevice(item.id);
            } else if (item?.type === 'stream') {
              e.preventDefault();
              setFocusedId(item.device.ip);
            }
            triggerKeyboardFocus();
          }
          break;
        case 'Enter':
          if (focusedId) {
            const item = visibleItems.find(i => i.id === focusedId);
            if (item) {
              e.preventDefault();
              if (item.type === 'device') {
                toggleDevice(item.id);
              } else if (item.stream) {
                onStreamSelect(item.stream);
              }
              triggerKeyboardFocus();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visibleItems, focusedId, expandedDevices, onStreamSelect]);

  // Nettoyage du chrono uniquement au démontage du composant
  useEffect(() => {
    return () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    };
  }, []);

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

  const handleIPInteraction = (e: React.MouseEvent, ip: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey) {
      import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(`http://${ip}`));
    } else {
      navigator.clipboard.writeText(ip);
      window.dispatchEvent(new CustomEvent('show-copy-toast', { 
        detail: { x: e.clientX, y: e.clientY } 
      }));
    }
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
          className={`absolute inset-0 z-10 flex items-center px-3 bg-zinc-950 transition-transform duration-50 ease-in-out origin-right ${isSearchOpen ? 'scale-x-100' : 'scale-x-0 pointer-events-none'
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
            {sortBy === 'name' ? (
              <ArrowDownAZ size="0.875rem" />
            ) : (
              <svg width="0.875rem" height="0.875rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide">
                <path d="m3 16 4 4 4-4" />
                <path d="M7 20V4" />
                <path d="M17 4v6" />
                <path d="M15 20v-6h3a1.5 1.5 0 0 1 0 3h-3" />
              </svg>
            )}
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

      <div
        onMouseLeave={() => {
          setIsFocusVisible(false);
          if (focusTimer.current) clearTimeout(focusTimer.current);
        }}
        className="flex-1 overflow-y-auto p-0 space-y-0"
      >
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
            const isFocused = focusedId === device.ip;
            const isVisible = isFocused && isFocusVisible;
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
                  onMouseEnter={() => {
                    setFocusedId(device.ip);
                    setIsFocusVisible(true);
                    if (focusTimer.current) clearTimeout(focusTimer.current);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 transition-all duration-500 group relative focus:outline-none ${isVisible ? 'bg-neutral-800/80' : 'bg-neutral-950 hover:bg-neutral-900/60'
                    }`}
                >
                  <div className={`absolute top-0 -bottom-px -left-px w-[3px] bg-zinc-400 z-20 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`} />
                  <div className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                    <ChevronRight size="0.875rem" className={isVisible ? "text-neutral-300" : "text-neutral-600"} />
                  </div>
                  <div className="relative pointer-events-none">
                    <HardDrive size="0.875rem" className={`transition-colors ${isVisible ? "text-neutral-200" : "text-neutral-500 group-hover:text-neutral-300"}`} />
                    <div className={`absolute -top-1 -right-1 w-2 h-2 ${statusClass}`} />
                  </div>

                  <div className="relative z-10 flex flex-col items-start leading-none min-w-0 text-left">
                    <span
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigator.clipboard.writeText(device.name);
                        window.dispatchEvent(new CustomEvent('show-copy-toast', { 
                          detail: { x: e.clientX, y: e.clientY } 
                        }));
                      }}
                      className={`text-[0.6875rem] font-bold truncate w-full tracking-tight pb-0.5 transition-colors ${isVisible ? 'text-white' : 'text-neutral-200'
                        }`}
                    >
                      {device.name}
                    </span>
                    <span
                      onContextMenu={(e) => handleIPInteraction(e, device.ip)}
                      className={`text-xs font-mono mt-0.5 transition-colors ${isVisible ? 'text-zinc-400' : 'text-zinc-500'
                        }`}
                    >
                      {device.ip}
                    </span>
                  </div>

                  {/* Background Ghost Logo */}
                  {manufacturerLogos[device.manufacturer.split(' (')[0]] && (
                    <div className={`absolute top-0 right-0 h-full w-24 opacity-[0.40] pointer-events-none z-0 flex items-center justify-end pr-2 overflow-hidden transition-colors ${isVisible ? 'text-neutral-500' : 'text-neutral-600'
                      }`}>
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
                      const isStreamFocused = focusedId === stream.id;
                      const isStreamVisible = isStreamFocused && isFocusVisible;

                      return (
                        <button
                          key={stream.id}
                          onClick={() => handleStreamClick(stream)}
                          onMouseEnter={() => {
                            setFocusedId(stream.id);
                            setIsFocusVisible(true);
                            if (focusTimer.current) clearTimeout(focusTimer.current);
                          }}
                          className={`w-full flex flex-col items-start py-2 pl-8 pr-3 text-[0.75rem] transition-all duration-500 border-b border-neutral-800/30 relative focus:outline-none ${selectedStreamId === stream.id
                            ? "bg-neutral-800 text-white font-bold"
                            : isStreamVisible
                              ? "bg-neutral-800/40 text-white"
                              : "text-zinc-500 hover:text-zinc-200 hover:bg-neutral-800/40"
                            }`}
                        >
                          <div className={`absolute top-0 -bottom-px -left-px w-[3px] bg-zinc-400 z-20 transition-opacity duration-500 ${isStreamVisible && selectedStreamId !== stream.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`} />
                          <div className="flex items-center gap-2 w-full relative z-10">
                            <div className={`w-1.5 h-1.5 ${streamStatusClass}`} />
                            <span
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigator.clipboard.writeText(stream.name);
                                window.dispatchEvent(new CustomEvent('show-copy-toast', { 
                                  detail: { x: e.clientX, y: e.clientY } 
                                }));
                              }}
                              className={`truncate flex-1 text-left transition-colors ${(selectedStreamId === stream.id || isStreamVisible) ? 'text-white' : 'text-zinc-300'
                                }`}
                            >
                              {stream.name}
                            </span>
                          </div>
                          <span
                            onContextMenu={(e) => handleIPInteraction(e, stream.multicastIp)}
                            className={`text-xs font-mono mt-0.5 pl-3.5 transition-colors relative z-10 ${isStreamVisible ? 'text-zinc-400' : 'text-zinc-500'
                              }`}
                          >
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