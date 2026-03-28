import { useState, useEffect } from "react";
import { Copy, Check, Download, Activity, FileText, ChevronUp, ChevronDown } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface SdpViewerProps {
  sdp: string | null;
  sourceIp?: string;
}

export function SdpViewer({ sdp, sourceIp }: SdpViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [displayMode, setDisplayMode] = useState<'auto' | 'mac' | 'ip' | 'name'>('auto');
  const [arpTable, setArpTable] = useState<Record<string, { ip: string; name: string }>>({});

  useEffect(() => {
    invoke<Record<string, { ip: string; name: string }>>("get_arp_table").then(setArpTable);

    const unlisten = listen<[string, { ip: string; name: string }]>("discovery-update", (event) => {
      const [mac, info] = event.payload;
      setArpTable(prev => ({
        ...prev,
        [mac]: info
      }));
    });

    return () => {
       unlisten.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    // Reset to auto when SDP changes
    setDisplayMode('auto');
  }, [sdp]);

  const ptpIdToMac = (ptpId: string) => {
    const norm = ptpId.replace(/:/g, '-');
    const parts = norm.split('-');
    if (parts.length === 8) {
      return [parts[0], parts[1], parts[2], parts[5], parts[6], parts[7]].join(':').toUpperCase();
    }
    return ptpId.replace(/-/g, ':').toUpperCase();
  };

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

  const parseStreamInfo = (raw: string | null) => {
    if (!raw) return null;
    const lines = raw.split(/\r?\n/);
    let resolution = "---";
    let samplingRate = "---";
    let nbChannels = "---";
    let ptime = "---";
    let masterClock = "Unknown";

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (line.startsWith("a=rtpmap:")) {
        const parts = line.split(" ");
        if (parts.length >= 2) {
          const params = parts[1].split("/");
          const codec = params[0] || "";
          if (codec.includes("L24")) resolution = "24 bits";
          else if (codec.includes("L16")) resolution = "16 bits";
          else resolution = codec;

          samplingRate = params[1] ? `${params[1]} Hz` : "---";
          nbChannels = params[2] ? `${params[2]} channels` : "---";
        }
      } else if (line.startsWith("a=ptime:")) {
        ptime = `${line.substring(8).trim()} ms`;
      } else if (lowerLine.includes("ts-refclk:ptp=")) {
        const parts = line.split(":");
        if (parts.length >= 3) {
           masterClock = parts[parts.length - 2] || "---";
        }
      }
    }
    return { resolution, samplingRate, nbChannels, ptime, masterClock };
  };

  const streamInfo = parseStreamInfo(sdp);
  const gmId = streamInfo?.masterClock || "";
  const gmMac = gmId ? ptpIdToMac(gmId) : "";
  const resolvedIp = sourceIp;
  
  // Exhaustive lookup for simulated or real environments
  const resolved = arpTable[gmId] || arpTable[gmMac] || (resolvedIp ? arpTable[resolvedIp] : null);

  // Logic for display: Name > IP > MAC
  const hasName = resolved?.name && resolved.name !== "---";
  const hasIp = !!resolved?.ip || !!resolvedIp;

  const cycleDisplayMode = () => {
    if (!hasIp && !hasName) return; // Only MAC available, no toggle

    if (displayMode === 'auto') {
      // First click: from best auto to next best or MAC
      if (hasName) setDisplayMode('ip');
      else setDisplayMode('mac');
    } else if (displayMode === 'ip') {
      setDisplayMode('mac');
    } else if (displayMode === 'mac') {
      if (hasName) setDisplayMode('name');
      else if (hasIp) setDisplayMode('ip');
    } else if (displayMode === 'name') {
      setDisplayMode('ip');
    }
  };

  const getDisplayText = () => {
    if (displayMode === 'auto') {
      if (hasName) return resolved.name;
      if (hasIp) return resolved.ip;
      return gmMac;
    }
    if (displayMode === 'name') return resolved?.name || gmMac;
    if (displayMode === 'ip') return resolved?.ip || gmMac;
    return gmMac;
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 flex-1 min-w-0">
      <div className="bg-neutral-800 border-b border-neutral-700 h-14 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-neutral-400" />
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

      {/* Stream Info Drawer */}
      <div className="bg-neutral-800 border-t border-neutral-700 shrink-0">
        <button
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className="w-full h-8 flex items-center justify-between px-3 hover:bg-neutral-700/50 transition-all font-sans"
        >
          <span className="text-[10px] font-bold text-neutral-400 tracking-wider">STREAM INFOS</span>
          {isDrawerOpen ? <ChevronDown size={14} className="text-neutral-500" /> : <ChevronUp size={14} className="text-neutral-500" />}
        </button>

        {isDrawerOpen && (
          <div className="px-3 pb-3 space-y-1 font-sans">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">Resolution</span>
              <span className="text-[10px] text-neutral-200 font-mono">{streamInfo?.resolution}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">Sampling Rate</span>
              <span className="text-[10px] text-neutral-200 font-mono">{streamInfo?.samplingRate}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">Nb Channels</span>
              <span className="text-[10px] text-neutral-200 font-mono">{streamInfo?.nbChannels}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">Packet Time</span>
              <span className="text-[10px] text-neutral-200 font-mono">{streamInfo?.ptime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">Master Clock</span>
              <span 
                onClick={cycleDisplayMode}
                className={`text-[10px] text-neutral-200 font-mono font-bold tracking-tight px-1 rounded transition-all underline decoration-dotted decoration-neutral-600 ${hasIp || hasName ? 'cursor-pointer hover:text-white hover:bg-white/5' : ''}`}
                title={hasIp || hasName ? `Current: ${displayMode.toUpperCase()} | Click to cycle (Name/IP/MAC)` : "No other info available for this MAC"}
              >
                {getDisplayText()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
