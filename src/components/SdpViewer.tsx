import { Copy, Save, FileText, Download } from "lucide-react";

interface SdpViewerProps {
  sdp: string | null;
  sourceIp?: string;
}

export function SdpViewer({ sdp, sourceIp }: SdpViewerProps) {
  const handleCopy = () => {
    if (sdp) navigator.clipboard.writeText(sdp);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 flex-1 min-w-0">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-purple-400" />
          <h2 className="font-semibold text-zinc-100 uppercase tracking-wider text-sm truncate">
            {sourceIp ? `SDP from ${sourceIp}` : "SDP Preview"}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleCopy}
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium 
                     bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors 
                     disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Copy size={14} />
            Copy
          </button>
          <button 
            disabled={!sdp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium 
                     bg-blue-600 hover:bg-blue-500 text-white transition-colors 
                     disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-black/20">
        {sdp ? (
          <pre className="text-xs font-mono text-zinc-400 leading-relaxed selection:bg-blue-500/30 selection:text-white">
            {sdp}
          </pre>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
            <Download size={48} className="opacity-20 translate-y-2 animate-bounce" />
            <p className="text-sm italic">Waiting for broadcast streams...</p>
          </div>
        )}
      </div>
    </div>
  );
}
