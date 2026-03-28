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
    <div className="flex flex-col h-full bg-neutral-900 flex-1 min-w-0">
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 flex items-center justify-between px-3">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={14} className="text-neutral-400" />
          <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-tight truncate">SDP</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1 text-[10px] font-bold uppercase tracking-wider
                     bg-neutral-900 border border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-all
                     disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? "COPIED" : "COPY"}
          </button>
          <button
            onClick={handleSave}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1 text-[10px] font-bold uppercase tracking-wider
                     bg-neutral-700 hover:bg-neutral-600 text-white transition-all
                     disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            SAVE
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#1E1E1E] p-4 font-mono text-sm text-neutral-300 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-neutral-900">
        {sdp ? (
          <div className="max-w-none">
             <div className="flex items-center gap-2 mb-4 opacity-50">
               <Activity size={12} />
               <span className="text-[10px] uppercase tracking-widest">{sourceIp}</span>
             </div>
             
             <pre className="leading-relaxed selection:bg-neutral-700 overflow-visible whitespace-pre-wrap">
                {sdp.split(/\r?\n/).map((line, i) => (
                  <div key={i} className="flex gap-4 hover:bg-neutral-800/10 -mx-4 px-4 transition-colors">
                    <span className="w-5 text-right text-neutral-700 select-none font-bold text-[10px] leading-tight">{i + 1}</span>
                    <span className="break-all">{line}</span>
                  </div>
                ))}
             </pre>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-neutral-800 space-y-4">
             <Activity size={32} className="animate-pulse opacity-20" />
             <p className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-20">Monitoring Network</p>
          </div>
        )}
      </div>
    </div>
  );
}
