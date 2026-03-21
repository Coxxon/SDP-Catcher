import dgram from 'node:dgram';

const MULTICAST_ADDR = '239.255.255.255';
const PTP_MULTICAST_ADDR = '224.0.1.129';
const PORT = 9875;
const PTP_PORT = 320;

const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

// Configuration des constructeurs basée sur ta table OUI (Rust)
const manufacturers = [
  { name: "Riedel", oui: "001ACA", interval: 10000 },
  { name: "Audinate_Dante", oui: "001DC1", interval: 30000 },
  { name: "Yamaha", oui: "00A0DE", interval: 30000 },
  { name: "Lawo", oui: "00907F", interval: 30000 },
  { name: "Merging", oui: "001564", interval: 30000 },
  { name: "SSL", oui: "000B8C", interval: 30000 },
  { name: "Allen_Heath", oui: "001B66", interval: 30000 },
  { name: "Avid", oui: "00055D", interval: 30000 },
  { name: "Shure", oui: "0024BE", interval: 30000 },
  { name: "Sennheiser", oui: "000462", interval: 30000 },
  { name: "Audio_Technica", oui: "00091F", interval: 30000 },
  { name: "Blackmagic", oui: "E091F5", interval: 35000 },
  { name: "Focusrite", oui: "000EEC", interval: 30000 },
  { name: "Genelec", oui: "000A8F", interval: 30000 },
  { name: "Neumann", oui: "000AF3", interval: 30000 },
  { name: "Apogee", oui: "00066A", interval: 30000 },
  { name: "Luminex", oui: "001B55", interval: 35000 },
  { name: "Netgear_AV", oui: "D83ADD", interval: 35000 },
  { name: "d_b_audiotechnik", oui: "00242C", interval: 35000 },
  { name: "L_Acoustics", oui: "903EAB", interval: 35000 },
  { name: "Meyer_Sound", oui: "000D4B", interval: 35000 }
];

// Topologie PTP Spécifique (Riedel & Luminex)
const G_RIEDEL_ID = '00-1A-CA-FF-FE-AA-BB-CC';
const G_LUMINEX_ID = '00-1B-55-FF-FE-11-22-33';

// Générateur de Clock ID (EUI-64) respectant le OUI constructeur
const generatePtpId = (oui, ip) => {
  const lastPart = parseInt(ip.split('.')[3]).toString(16).padStart(2, '0').toUpperCase();
  const formattedOui = oui.match(/.{1,2}/g).join('-');
  // Format standard : OUI-FF-FE-00-Suffix
  return `${formattedOui}-FF-FE-00-${lastPart}`;
};

// Initialisation des devices
let currentIpSuffix = 121;
let currentMulticastSubnet = 10;

const devices = manufacturers.map(m => {
  const ip = `192.168.1.${currentIpSuffix++}`;
  const multicast = `239.69.${currentMulticastSubnet++}.1`;
  const ptpId = (m.name === "Riedel") ? G_RIEDEL_ID :
    (m.name === "Luminex") ? G_LUMINEX_ID :
      generatePtpId(m.oui, ip);

  return {
    name: m.name,
    ip: ip,
    ptpId: ptpId,
    interval: m.interval,
    streams: [{ name: `${m.name}_Main_Stream`, multicast: multicast }]
  };
});

// Payload SDP conforme AES67 / SAP
const generatePayload = (device) => {
  const stream = device.streams[0];
  return Buffer.from(
    'SAP_HEADER_MOCK\n' +
    'v=0\n' +
    `o=- 123456789 1 IN IP4 ${device.ip}\n` +
    `s=${stream.name}\n` +
    `i=${device.name}\n` +
    `c=IN IP4 ${stream.multicast}\n` +
    't=0 0\n' +
    'm=audio 5004 RTP/AVP 97\n' +
    'a=rtpmap:97 L24/48000/2\n' +
    `a=ts-refclk:ptp=IEEE1588-2008:${device.ptpId}:0\n` +
    'a=recvonly'
  );
};

// Construction du message PTP Announce (Binaire)
const createPtpAnnounceBuffer = (ptpId, domain = 0) => {
  const buf = Buffer.alloc(64);
  buf[0] = 0x0B; // Message Type: Announce
  buf[4] = domain;
  const hex = ptpId.replace(/-/g, '');
  for (let i = 0; i < 8; i++) {
    buf[20 + i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return buf;
};

server.on('error', (err) => {
  console.error(`Simulator Error: ${err.stack}`);
  server.close();
});

server.on('listening', () => {
  const addr = server.address();
  console.log(`🚀 Multi-Vendor Simulator active on ${addr.address}:${addr.port}`);
  console.log(`📡 Simulating ${devices.length} manufacturers with OUI-matching PTP IDs...`);

  // Boucles SAP indépendantes
  devices.forEach(device => {
    const sendSap = () => {
      const payload = generatePayload(device);
      server.send(payload, 0, payload.length, PORT, MULTICAST_ADDR);
    };

    sendSap(); // Premier envoi immédiat
    setInterval(sendSap, device.interval);
  });

  // Boucle PTP Announce (Toutes les secondes)
  setInterval(() => {
    const bRiedel = createPtpAnnounceBuffer(G_RIEDEL_ID, 0);
    server.send(bRiedel, 0, bRiedel.length, PTP_PORT, PTP_MULTICAST_ADDR);

    const bLuminex = createPtpAnnounceBuffer(G_LUMINEX_ID, 127);
    server.send(bLuminex, 0, bLuminex.length, PTP_PORT, PTP_MULTICAST_ADDR);
  }, 1000);
});

server.bind(() => {
  server.setBroadcast(true);
});