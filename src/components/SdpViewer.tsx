import { useState } from "react";
import { Copy, Check, Download, Activity, Globe } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

interface SdpViewerProps {
  sdp: string | null;
  sourceIp?: string;
}

export function SdpViewer({ sdp, sourceIp }: SdpViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (sdp) {
      navigator.clipboard.writeText(sdp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    if (!sdp) return;
    try {
      const filePath = await save({
        filters: [{ name: "SDP File", extensions: ["sdp"] }],
        defaultPath: "stream.sdp",
      });
      if (filePath) {
        await writeTextFile(filePath, sdp);
      }
    } catch (err) {
      console.error("Failed to save SDP file", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 flex-1 min-w-0">
      <div className="p-4 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-3 min-w-0">
          <Globe size={16} className="text-zinc-500" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 truncate">SDP Details</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider
                     bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-all border border-zinc-700
                     disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? "COPIED" : "COPY"}
          </button>
          <button
            onClick={handleSave}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider
                     bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-blue-500/10
                     disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            SAVE
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 scrollbar-zinc">
        {sdp ? (
          <div className="max-w-3xl mx-auto space-y-4">
             <div className="flex items-center gap-2 opacity-40">
               <Activity size={12} className="text-blue-400" />
               <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">{sourceIp}</span>
             </div>
             
             <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-md overflow-auto shadow-inner">
               <pre className="font-mono text-xs text-zinc-300 leading-relaxed selection:bg-blue-500/30">
                  {sdp.split(/\r?\n/).map((line, i) => (
                    <div key={i} className="flex gap-4 hover:bg-zinc-800/80 -mx-2 px-2 transition-colors">
                      <span className="w-5 text-right text-zinc-600 select-none font-bold text-[10px]">{i + 1}</span>
                      <span className="break-all">{line}</span>
                    </div>
                  ))}
               </pre>
             </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-800 space-y-4">
             <Activity size={32} className="animate-pulse opacity-20" />
             <p className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-20">Network Discovery Active</p>
          </div>
        )}
      </div>
    </div>
  );
}
