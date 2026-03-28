import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Network, Activity, Settings, RefreshCw, X, Check, Pencil } from "lucide-react";

interface InterfaceInfo {
  name: string;
  ip: string;
  mask: string;
}

interface InterfaceListProps {
  activeIp: string | null;
  onInterfaceSelect: (ip: string) => void;
}

const maskToCidr = (mask: string): number => {
  return mask.split('.').reduce((acc, octet) => acc + (Number(octet).toString(2).match(/1/g) || []).length, 0);
};

export function InterfaceList({ activeIp, onInterfaceSelect }: InterfaceListProps) {
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [hiddenInterfaces, setHiddenInterfaces] = useState<string[]>(() => {
    const saved = localStorage.getItem("hiddenInterfaces");
    return saved ? JSON.parse(saved) : [];
  });

  const [editingIp, setEditingIp] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ isDhcp: false, ip: '', mask: '' });
  const [isPending, setIsPending] = useState(false);

  const refreshInterfaces = () => {
    invoke<InterfaceInfo[]>("get_network_interfaces")
      .then(setInterfaces)
      .catch(console.error);
  };

  useEffect(() => {
    refreshInterfaces();
  }, []);

  useEffect(() => {
    localStorage.setItem("hiddenInterfaces", JSON.stringify(hiddenInterfaces));
  }, [hiddenInterfaces]);

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

  const handleDoubleClick = (iface: InterfaceInfo) => {
    if (isEditMode) return;
    setEditingIp(iface.ip);
    setEditForm({ isDhcp: false, ip: iface.ip, mask: iface.mask });
  };

  const handleApply = async (iface: InterfaceInfo) => {
    setIsPending(true);
    try {
      const result = await invoke("set_network_ip", {
        interfaceName: iface.name,
        isDhcp: editForm.isDhcp,
        ip: editForm.isDhcp ? null : editForm.ip,
        mask: editForm.isDhcp ? null : editForm.mask
      });
      console.log(result);
      setEditingIp(null);
      setTimeout(refreshInterfaces, 2000); // Wait for Windows to update
    } catch (err: any) {
      alert(`Erreur: ${err}`);
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-r border-neutral-700 w-64 lg:w-72 shrink-0">
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-neutral-400" />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight">Interfaces</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refreshInterfaces}
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
              
              if (isEditing) {
                  return (
                    <div key={iface.ip} 
                         onClick={(e) => e.stopPropagation()}
                         className="p-3 bg-neutral-800 border-b border-neutral-700 space-y-3"
                    >
                        <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{iface.name}</span>
                             <div className="flex gap-2">
                                 <button onClick={() => setEditingIp(null)} className="text-neutral-500 hover:text-white"><X size={14} /></button>
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
                                        onChange={e => setEditForm({...editForm, ip: e.target.value})}
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] text-neutral-500 uppercase font-bold pl-1">Subnet Mask</label>
                                    <input 
                                        type="text" 
                                        value={editForm.mask}
                                        onChange={e => setEditForm({...editForm, mask: e.target.value})}
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                            </div>
                        )}

                        <button 
                            disabled={isPending}
                            onClick={() => handleApply(iface)}
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
                  className={`w-full text-left px-3 py-2 transition-all border-b border-neutral-800/50 group relative flex flex-col gap-0.5 ${
                    isActive
                      ? "bg-neutral-700 text-white"
                      : "text-neutral-400 hover:bg-neutral-800"
                  } ${isHidden ? "opacity-30" : "opacity-100"} select-none`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium truncate tracking-tight ${isActive ? 'text-white' : 'text-zinc-200'} ${isHidden ? 'line-through' : ''}`}>
                      {iface.name}
                    </span>
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
                      {isActive && <Activity size={10} className="text-blue-400 animate-pulse" />}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 font-mono flex gap-2">
                    <span>{iface.ip} <span className="opacity-60">/{cidr}</span></span>
                  </div>
                </button>
              );
            })
        )}
      </div>
    </div>
  );
}
