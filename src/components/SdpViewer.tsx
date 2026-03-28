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
    <div className="flex flex-col h-full bg-[#0B0C0E] flex-1 min-w-0">
      <div className="p-4 border-b border-[#1E1F22] flex items-center justify-between bg-[#0B0C0E]/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Globe size={18} className="text-[#3B82F6]" />
          <h2 className="variant-header text-white truncate">SDP</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider
                     bg-[#1E1F22] hover:bg-[#2A2B2F] text-white transition-all active:scale-95
                     disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            {copied ? "COPIED" : "COPY"}
          </button>
          <button
            onClick={handleSave}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider
                     bg-[#3B82F6] hover:bg-[#2563EB] text-white transition-all active:scale-95
                     shadow-lg shadow-blue-500/5
                     disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            SAVE
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-black/20 p-6 custom-scrollbar">
        {sdp ? (
          <div className="max-w-3xl mx-auto">
             <div className="flex items-center gap-2 mb-6 opacity-30">
               <Activity size={12} />
               <span className="text-[10px] font-mono uppercase tracking-widest">{sourceIp}</span>
             </div>
             <pre className="text-[13px] font-mono text-white leading-6 selection:bg-[#3B82F6]/40">
                {sdp.split(/\r?\n/).map((line, i) => (
                  <div key={i} className="flex gap-6 hover:bg-[#3B82F6]/5 -mx-4 px-4 transition-colors">
                    <span className="w-6 text-right text-[#3B82F6]/20 select-none font-bold italic">{i + 1}</span>
                    <span className="break-all">{line}</span>
                  </div>
                ))}
             </pre>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[#1E1F22] space-y-4">
             <Activity size={48} className="animate-pulse opacity-40" />
             <p className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-40">Listening for multicast data</p>
          </div>
        )}
      </div>
    </div>
  );
}
