import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Network, Settings, RefreshCw, X, Check, Pencil } from "lucide-react";
import { Device, InterfaceInfo } from "../App";

interface InterfaceListProps {
  activeIp: string | null;
  isSniffing: boolean;
  interfaces: InterfaceInfo[];
  devices: Device[];
  onInterfaceSelect: (ip: string) => void;
  setIsSniffing: (value: boolean) => void;
  onRefreshInterfaces: () => Promise<InterfaceInfo[]>;
  onStartSniffing: (ifaces: InterfaceInfo[]) => Promise<void>;
  zoomLevel: number;
}

const maskToCidr = (mask: string): number => {
  return mask.split('.').reduce((acc, octet) => acc + (Number(octet).toString(2).match(/1/g) || []).length, 0);
};

const validateIpOrMask = (value: string): boolean => {
  const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return regex.test(value);
};

const formatIpInput = (value: string, oldValue: string): string => {
  const clean = value.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 4) return oldValue;
  const isDeleting = value.length < oldValue.length;
  let newParts = [];
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    if (part !== '' && parseInt(part) > 255) return oldValue;
    if (part.length > 1 && part[0] === '0') return oldValue;
    newParts.push(part);
    if (!isDeleting && i < 3 && i === parts.length - 1) {
      if (part.length === 3 || (part === '0' && value.endsWith('0'))) {
        newParts.push('');
      }
    }
  }
  let result = newParts.join('.');
  if (isDeleting && oldValue.endsWith('.') && value === oldValue.slice(0, -1)) return value;
  return result;
};

export function InterfaceList({ 
    activeIp, 
    isSniffing, 
    interfaces, 
    devices, 
    onInterfaceSelect, 
    setIsSniffing,
    onRefreshInterfaces,
    onStartSniffing,
    zoomLevel
}: InterfaceListProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  useEffect(() => {
    invoke('set_window_constraints', { collapsed: isCollapsed, zoomLevel }).catch(console.error);
  }, [isCollapsed, zoomLevel]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [hiddenInterfaces, setHiddenInterfaces] = useState<string[]>(() => {
    const saved = localStorage.getItem("hiddenInterfaces");
    return saved ? JSON.parse(saved) : [];
  });

  const [editingIp, setEditingIp] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ isDhcp: false, ip: '', mask: '' });
  const [fieldErrors, setFieldErrors] = useState<{ip?: boolean, mask?: boolean}>({});
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    localStorage.setItem("hiddenInterfaces", JSON.stringify(hiddenInterfaces));
  }, [hiddenInterfaces]);

  const ipToLong = (ip: string) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;

  const getStreamCount = (iface: InterfaceInfo) => {
    const m = ipToLong(iface.mask);
    const target = (ipToLong(iface.ip) & m) >>> 0;
    
    return devices.reduce((acc, d) => {
        if (((ipToLong(d.ip) & m) >>> 0) === target) {
            return acc + d.streams.length;
        }
        return acc;
    }, 0);
  };

  const handleClick = (ip: string) => {
    if (editingIp) return;
    if (isEditMode) {
      setHiddenInterfaces((prev) =>
        prev.includes(ip) ? prev.filter((i) => i !== ip) : [...prev, ip]
      );
    } else {
      onInterfaceSelect(ip);
    }
  };

  const handleDoubleClick = async (iface: InterfaceInfo) => {
    if (isEditMode) return;
    setIsSniffing(false);
    await invoke("stop_sniffing");
    setEditingIp(iface.ip);
    setEditForm({ isDhcp: false, ip: iface.ip, mask: iface.mask });
  };

  const handleApply = async (iface: InterfaceInfo) => {
    if (!editForm.isDhcp) {
        const ipValid = validateIpOrMask(editForm.ip);
        const maskValid = validateIpOrMask(editForm.mask);
        if (!ipValid || !maskValid) {
            setFieldErrors({ ip: !ipValid, mask: !maskValid });
            return;
        }
    }
    setFieldErrors({});
    setIsPending(true);
    try {
      await invoke("set_network_ip", {
        interfaceName: iface.name,
        isDhcp: editForm.isDhcp,
        ip: editForm.isDhcp ? null : editForm.ip,
        mask: editForm.isDhcp ? null : editForm.mask
      });
      await new Promise((r) => setTimeout(r, 2500));
      const newIfaces = await onRefreshInterfaces();
      await onStartSniffing(newIfaces);
      const finalIp = editForm.isDhcp ? iface.ip : editForm.ip;
      onInterfaceSelect(finalIp); 
      setEditingIp(null);
    } catch (err: any) {
      alert(`Erreur: ${err}`);
      console.error(err);
    } finally {
      setIsPending(false);
    }
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

  return (
    <div className={`flex flex-col h-full bg-neutral-900 border-r border-neutral-700 transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${isCollapsed ? 'w-16 min-w-[4rem] max-w-[4rem]' : 'w-[15.9375rem] min-w-[15.9375rem] max-w-[15.9375rem]'}`}>
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 relative flex items-center overflow-hidden shrink-0 w-full">
        {/* Clickable Header Button */}
        <div 
          className={`absolute left-2 h-9 cursor-pointer hover:bg-neutral-700 rounded transition-all duration-300 flex items-center overflow-hidden whitespace-nowrap ${
            isCollapsed ? 'w-12 pl-[1.0625rem]' : 'w-[7.1875rem] pl-2'
          }`}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <Network 
            size="0.875rem" 
            className={`shrink-0 ${isSniffing ? "text-green-500 animate-pulse" : (activeIp ? "text-amber-500" : "text-neutral-400")}`} 
          />
          <h2 className={`text-xs ml-2 font-semibold text-neutral-200 uppercase tracking-tight transition-all duration-300 delay-75 ${
            isCollapsed ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
          }`}>
            Interfaces
          </h2>
        </div>

        {/* Action Buttons */}
        <div className={`absolute right-3 flex items-center gap-1 shrink-0 transition-all duration-300 ${
            isCollapsed ? 'opacity-0 pointer-events-none translate-x-4' : 'opacity-100 translate-x-0'
        }`}>
          <button
            onClick={onRefreshInterfaces}
            className="p-1.5 rounded-md hover:bg-neutral-700 transition-all text-neutral-500 hover:text-white"
            title="Refresh Network Interfaces"
          >
            <RefreshCw size="0.875rem" />
          </button>
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`p-1.5 rounded-md hover:bg-neutral-700 transition-all ${
              isEditMode ? "text-blue-400 bg-neutral-700" : "text-neutral-500 hover:text-white"
            }`}
            title="Interface Configuration"
          >
            <Settings size="0.875rem" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {interfaces.length === 0 ? (
          <div className="p-3 text-neutral-600 text-[0.6875rem] italic">
            Scanning...
          </div>
        ) : (
          interfaces
            .filter((iface) => isEditMode || !hiddenInterfaces.includes(iface.ip))
            .map((iface) => {
              const isActive = activeIp === iface.ip;
              const isHidden = hiddenInterfaces.includes(iface.ip);
              const isEditing = editingIp === iface.ip;
              const cidr = maskToCidr(iface.mask);
              const streamCount = getStreamCount(iface);
              
              if (isEditing) {
                  return (
                    <div key={iface.ip} 
                         onClick={(e) => e.stopPropagation()}
                         className="p-3 bg-neutral-800 border-b border-neutral-700 space-y-3"
                    >
                        <div className="flex items-center justify-between mb-2">
                             <span className="text-[0.625rem] font-bold text-neutral-500 uppercase tracking-widest">{iface.name}</span>
                             <div className="flex gap-2">
                                 <button 
                                     onClick={async (e) => { 
                                         e.stopPropagation(); 
                                         setEditingIp(null);
                                         onStartSniffing(interfaces);
                                     }} 
                                     className="text-neutral-500 hover:text-white"
                                 >
                                     <X size="0.875rem" />
                                 </button>
                             </div>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-neutral-900 p-1 rounded-md mb-2">
                            <button 
                                onClick={() => setEditForm({...editForm, isDhcp: true})}
                                className={`flex-1 py-1 text-[0.625rem] font-bold rounded ${editForm.isDhcp ? 'bg-neutral-700 text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
                            >DHCP</button>
                            <button 
                                onClick={() => setEditForm({...editForm, isDhcp: false})}
                                className={`flex-1 py-1 text-[0.625rem] font-bold rounded ${!editForm.isDhcp ? 'bg-neutral-700 text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
                            >STATIC</button>
                        </div>

                        {!editForm.isDhcp && (
                            <div className="space-y-2">
                                <div className="space-y-1">
                                    <label className="text-[0.5625rem] text-neutral-500 uppercase font-bold pl-1">IP Address</label>
                                    <input 
                                        type="text" 
                                        value={editForm.ip}
                                        onChange={e => {
                                            const formatted = formatIpInput(e.target.value, editForm.ip);
                                            setEditForm({...editForm, ip: formatted});
                                            if (fieldErrors.ip) setFieldErrors({...fieldErrors, ip: false});
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleApply(iface);
                                            }
                                        }}
                                        placeholder="0.0.0.0"
                                        className={`w-full bg-neutral-900 border ${fieldErrors.ip ? 'border-red-500' : 'border-neutral-700'} rounded px-2 py-1 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500/50`}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[0.5625rem] text-neutral-500 uppercase font-bold pl-1">Subnet Mask</label>
                                    <input 
                                        type="text" 
                                        value={editForm.mask}
                                        onChange={e => {
                                            const formatted = formatIpInput(e.target.value, editForm.mask);
                                            setEditForm({...editForm, mask: formatted});
                                            if (fieldErrors.mask) setFieldErrors({...fieldErrors, mask: false});
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleApply(iface);
                                            }
                                        }}
                                        placeholder="255.255.255.0"
                                        className={`w-full bg-neutral-900 border ${fieldErrors.mask ? 'border-red-500' : 'border-neutral-700'} rounded px-2 py-1 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500/50`}
                                    />
                                </div>
                            </div>
                        )}

                        <button 
                            disabled={isPending}
                            onClick={(e) => { e.stopPropagation(); handleApply(iface); }}
                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[0.625rem] font-bold rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isPending ? <RefreshCw size="0.75rem" className="animate-spin" /> : <Check size="0.75rem" />}
                            APPLY CHANGES
                        </button>
                    </div>
                  );
              }

              return (
                <button
                  key={iface.ip}
                  onClick={() => handleClick(iface.ip)}
                  className={`w-full ${isCollapsed ? 'text-center' : 'text-left'} px-3 py-2 transition-all border-b group relative flex flex-col gap-0.5 overflow-hidden ${
                    isActive
                      ? "bg-neutral-800 text-white border-neutral-700"
                      : "text-neutral-400 hover:bg-neutral-800/40 border-neutral-800/50"
                  } ${isHidden ? "opacity-30" : "opacity-100"} select-none`}
                  title={isCollapsed ? `${iface.name}\n${iface.ip}/${cidr}` : undefined}
                >
                  {isCollapsed ? (
                    <div className="flex flex-col items-center justify-center py-1 w-full">
                        <span className={`text-[0.625rem] font-bold text-center tracking-wider px-1 truncate w-full ${isActive ? 'text-white' : 'text-zinc-200'} ${isHidden ? 'line-through' : ''}`}>
                          {iface.name.substring(0, 3).toUpperCase()}
                        </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span 
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigator.clipboard.writeText(iface.name);
                                window.dispatchEvent(new CustomEvent('show-copy-toast', { 
                                  detail: { x: e.clientX, y: e.clientY } 
                                }));
                              }}
                              className={`text-sm font-medium truncate tracking-tight ${isActive ? 'text-white' : 'text-zinc-200'} ${isHidden ? 'line-through' : ''}`}
                            >
                              {iface.name}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!isEditMode && (
                            <div 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                handleDoubleClick(iface); 
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-600 text-neutral-400 hover:text-white transition-all cursor-pointer shrink-0"
                            >
                              <Pencil size="0.75rem" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
                        <span 
                          onContextMenu={(e) => handleIPInteraction(e, iface.ip)}
                          className="truncate"
                        >
                          {iface.ip} <span>/{cidr}</span>
                        </span>
                        {streamCount > 0 && (
                            <span className="pr-1 shrink-0">
                                {streamCount} {streamCount === 1 ? 'stream' : 'streams'}
                            </span>
                        )}
                      </div>
                    </>
                  )}
                </button>
              );
            })
        )}
      </div>
    </div>
  );
}
