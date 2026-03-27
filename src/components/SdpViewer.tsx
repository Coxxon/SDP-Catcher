import { useState } from "react";
import { Copy, FileText, Check, Download, Activity } from "lucide-react";
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
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={18} className="text-purple-400 shrink-0" />
          <h2 className="font-semibold text-zinc-100 uppercase tracking-wider text-xs truncate">
            {sourceIp ? `SDP: ${sourceIp}` : "SDP Preview"}
          </h2>
        </div>
        
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button 
            onClick={handleCopy}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-tight
                     bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all active:scale-95
                     disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button 
            onClick={handleSave}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-tight
                     bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95
                     shadow-lg shadow-blue-500/10
                     disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 custom-scrollbar bg-black/10">
        {sdp ? (
          <div className="relative group">
             <div className="absolute -left-4 top-0 bottom-0 w-[1px] bg-zinc-800/50" />
             <pre className="text-[12px] font-mono text-zinc-500 leading-relaxed selection:bg-blue-500/30 selection:text-white whitespace-pre-wrap break-all">
                {sdp.split(/\r?\n/).map((line, i) => (
                  <div key={i} className="flex gap-4 hover:bg-zinc-800/10 -mx-2 px-2 transition-colors">
                    <span className="w-4 text-right opacity-20 select-none">{i + 1}</span>
                    <span>{line}</span>
                  </div>
                ))}
             </pre>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-800 space-y-6">
            <div className="relative">
              <Activity size={64} className="opacity-10 animate-pulse text-blue-500" />
              <Download size={32} className="absolute inset-0 m-auto opacity-5 animate-bounce text-zinc-400" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm font-medium tracking-widest text-zinc-700">LISTENING BROADCAST</p>
              <p className="text-[10px] italic opacity-40 uppercase tracking-tighter">Discovery thread is active on selected interface</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
