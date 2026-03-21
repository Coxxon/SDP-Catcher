import dgram from 'node:dgram';

const MULTICAST_ADDR = '239.255.255.255';
const PTP_MULTICAST_ADDR = '224.0.1.129';
const PORT = 9875;
const PTP_PORT = 320;

const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

// Configuration alignée sur ton Manufacturer.rs
const manufacturers = [
  { name: "Riedel", oui: "00197C", interval: 10000 },
  { name: "Audinate_Dante", oui: "001DC1", interval: 30000 },
  { name: "Yamaha", oui: "00A0DE", interval: 30000 },
  { name: "Merging", oui: "30D659", interval: 30000 },
  { name: "DirectOut", oui: "001E4C", interval: 30000 },
  { name: "Digico", oui: "0050C2", interval: 30000 },
  { name: "Shure", oui: "000EDD", interval: 30000 },
  { name: "Sennheiser", oui: "001B66", interval: 30000 },
  { name: "Genelec", oui: "AC4723", interval: 30000 },
  { name: "Luminex", oui: "D0699E", interval: 35000 },
  { name: "Netgear_AV", oui: "E091F5", interval: 35000 },
];

const G_RIEDEL_ID = '00-19-7C-FF-FE-AA-BB-CC';
const G_LUMINEX_ID = 'D0-69-9E-FF-FE-11-22-33'; // OUI synchronisé avec Rust

const generatePtpId = (oui, ip) => {
  const lastPart = parseInt(ip.split('.')[3]).toString(16).padStart(2, '0').toUpperCase();
  const formattedOui = oui.match(/.{1,2}/g).join('-');
  return `${formattedOui}-FF-FE-00-${lastPart}`;
};

let currentIpSuffix = 121;
let currentMulticastSubnet = 10;

const devices = manufacturers.map(m => {
  const ip = `192.168.1.${currentIpSuffix++}`;
  const multicast = `239.69.${currentMulticastSubnet++}.1`;
  const ptpId = (m.name === "Riedel") ? G_RIEDEL_ID :
    (m.name === "Luminex") ? G_LUMINEX_ID :
      generatePtpId(m.oui, ip);
  return { ...m, ip, ptpId, streams: [{ name: `${m.name}_Stream`, multicast }] };
});

// GÉNÉRATION D'UN VRAI PAQUET SAP BINAIRE
const generateSapPacket = (device) => {
  const stream = device.streams[0];

  // 1. Header SAP (8 octets)
  const header = Buffer.alloc(8);
  header.writeUInt8(0x20, 0); // Version 1, IPv4
  header.writeUInt8(0x00, 1); // Pas d'authentification
  header.writeUInt16BE(Math.floor(Math.random() * 65535), 2); // Message ID Hash

  // IP source de l'appareil simulé
  const ipParts = device.ip.split('.');
  for (let i = 0; i < 4; i++) header.writeUInt8(parseInt(ipParts[i]), 4 + i);

  // 2. Payload SDP (Texte)
  const sdp =
    'v=0\n' +
    `o=- 123456789 1 IN IP4 ${device.ip}\n` +
    `s=${stream.name}\n` +
    `i=${device.name}\n` +
    `c=IN IP4 ${stream.multicast}\n` +
    't=0 0\n' +
    'm=audio 5004 RTP/AVP 97\n' +
    'a=rtpmap:97 L24/48000/2\n' +
    `a=ts-refclk:ptp=IEEE1588-2008:${device.ptpId}:0\n` +
    'a=recvonly';

  return Buffer.concat([header, Buffer.from(sdp)]);
};

const createPtpAnnounceBuffer = (ptpId, domain = 0) => {
  const buf = Buffer.alloc(64);
  buf[0] = 0x0B; buf[4] = domain;
  const hex = ptpId.replace(/-/g, '');
  for (let i = 0; i < 8; i++) buf[20 + i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  return buf;
};

server.on('listening', () => {
  console.log(`🚀 Simulator (Production Mode) active.`);
  console.log(`📡 Sending real binary SAP packets to ${MULTICAST_ADDR}:${PORT}`);

  devices.forEach(device => {
    const sendSap = () => {
      const packet = generateSapPacket(device);
      server.send(packet, 0, packet.length, PORT, MULTICAST_ADDR);
    };
    sendSap();
    setInterval(sendSap, device.interval);
  });

  setInterval(() => {
    server.send(createPtpAnnounceBuffer(G_RIEDEL_ID, 0), 0, 64, PTP_PORT, PTP_MULTICAST_ADDR);
    server.send(createPtpAnnounceBuffer(G_LUMINEX_ID, 127), 0, 64, PTP_PORT, PTP_MULTICAST_ADDR);
  }, 1000);
});

server.bind(() => {
  server.setBroadcast(true);
  // Optionnel : si rien ne s'affiche, décommente la ligne ci-dessous 
  // et remplace par ton IP locale pour forcer l'interface réseau
  // server.setMulticastInterface('192.168.1.XX'); 
});