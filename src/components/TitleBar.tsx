import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Activity } from "lucide-react";
import { useEffect, useState } from "react";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const updateMaximized = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };
    updateMaximized();
    
    // Listen for resize changes
    const unlisten = appWindow.onResized(() => {
      updateMaximized();
    });
    
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  return (
    <div 
      data-tauri-drag-region 
      className="h-8 bg-[#09090b] border-b border-zinc-800 flex items-center justify-between px-3 select-none shrink-0 z-[100]"
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <Activity size={14} className="text-zinc-600" />
        <span className="text-[0.625rem] font-bold text-zinc-500 tracking-widest uppercase">SDP Catcher</span>
      </div>

      <div className="flex items-center h-full">
        <button
          onClick={() => appWindow.minimize()}
          className="h-full px-3 flex items-center justify-center hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="h-full px-3 flex items-center justify-center hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="h-full px-3 flex items-center justify-center hover:bg-red-600/80 transition-colors text-zinc-400 hover:text-white"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
