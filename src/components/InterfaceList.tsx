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
    onStartSniffing
}: InterfaceListProps) {
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

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-r border-neutral-700 w-[255px] min-w-[255px] max-w-[255px] shrink-0">
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Network 
            size={14} 
            className={isSniffing ? "text-green-500 animate-pulse" : (activeIp ? "text-amber-500" : "text-neutral-400")} 
          />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight">Interfaces</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefreshInterfaces}
            className="p-1.5 rounded-md hover:bg-neutral-700 transition-all text-neutral-500"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`p-1.5 rounded-md hover:bg-neutral-700 transition-all ${
              isEditMode ? "text-blue-400 bg-neutral-700" : "text-neutral-500"
            }`}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {interfaces.length === 0 ? (
          <div className="p-3 text-neutral-600 text-[11px] italic">
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
                             <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{iface.name}</span>
                             <div className="flex gap-2">
                                 <button 
                                     onClick={async (e) => { 
                                         e.stopPropagation(); 
                                         setEditingIp(null);
                                         onStartSniffing(interfaces);
                                     }} 
                                     className="text-neutral-500 hover:text-white"
                                 >
                                     <X size={14} />
                                 </button>
                             </div>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-neutral-900 p-1 rounded-md mb-2">
                            <button 
                                onClick={() => setEditForm({...editForm, isDhcp: true})}
                                className={`flex-1 py-1 text-[10px] font-bold rounded ${editForm.isDhcp ? 'bg-neutral-700 text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
                            >DHCP</button>
                            <button 
                                onClick={() => setEditForm({...editForm, isDhcp: false})}
                                className={`flex-1 py-1 text-[10px] font-bold rounded ${!editForm.isDhcp ? 'bg-neutral-700 text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
                            >STATIC</button>
                        </div>

                        {!editForm.isDhcp && (
                            <div className="space-y-2">
                                <div className="space-y-1">
                                    <label className="text-[9px] text-neutral-500 uppercase font-bold pl-1">IP Address</label>
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
                                    <label className="text-[9px] text-neutral-500 uppercase font-bold pl-1">Subnet Mask</label>
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
                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isPending ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                            APPLY CHANGES
                        </button>
                    </div>
                  );
              }

              return (
                <button
                  key={iface.ip}
                  onClick={() => handleClick(iface.ip)}
                  className={`w-full text-left px-3 py-2 transition-all border-b group relative flex flex-col gap-0.5 ${
                    isActive
                      ? "bg-neutral-800 text-white border-neutral-700"
                      : "text-neutral-400 hover:bg-neutral-800/40 border-neutral-800/50"
                  } ${isHidden ? "opacity-30" : "opacity-100"} select-none`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`text-sm font-medium truncate tracking-tight ${isActive ? 'text-white' : 'text-zinc-200'} ${isHidden ? 'line-through' : ''}`}>
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
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-600 text-neutral-400 hover:text-white transition-all cursor-pointer"
                        >
                          <Pencil size={12} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
                    <span>{iface.ip} <span>/{cidr}</span></span>
                    {streamCount > 0 && (
                        <span className="pr-1">
                            {streamCount} {streamCount === 1 ? 'stream' : 'streams'}
                        </span>
                    )}
                  </div>
                </button>
              );
            })
        )}
      </div>
    </div>
  );
}
