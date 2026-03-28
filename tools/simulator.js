import dgram from 'node:dgram';

const MULTICAST_ADDR = '239.255.255.255';
const PTP_MULTICAST_ADDR = '224.0.1.129';
const PORT = 9875;
const PTP_PORT = 320;

const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

// Liste des constructeurs et leurs intervalles d'annonce SAP
const manufacturers = [
  { name: "Riedel", interval: 5000 },
  { name: "Audinate_Dante", interval: 30000 },
  { name: "Yamaha", interval: 15000 }, // Gardé à 15s pour tests réactifs
  { name: "Lawo", interval: 35000 },
  { name: "Merging", interval: 30000 },
  { name: "DirectOut", interval: 30000 },
  { name: "Digico", interval: 35000 },
  { name: "SSL", interval: 35000 },
  { name: "Allen_Heath", interval: 35000 },
  { name: "QSC", interval: 35000 },
  { name: "Avid", interval: 35000 },
  { name: "Axia_Telos", interval: 35000 },
  { name: "Wheatstone", interval: 35000 },
  { name: "Ross_Video", interval: 40000 },
  { name: "Evertz", interval: 40000 },
  { name: "Grass_Valley", interval: 40000 },
  { name: "TSL", interval: 40000 },
  { name: "Calrec", interval: 40000 },
  { name: "ClearCom", interval: 40000 },
  { name: "RTS_Bosch", interval: 40000 },
  { name: "Shure", interval: 35000 },
  { name: "Sennheiser", interval: 35000 },
  { name: "Audio_Technica", interval: 35000 },
  { name: "BirdDog", interval: 40000 },
  { name: "Blackmagic", interval: 40000 },
  { name: "Focusrite", interval: 35000 },
  { name: "Genelec", interval: 35000 },
  { name: "Studer", interval: 35000 },
  { name: "Sonifex", interval: 35000 },
  { name: "Neumann", interval: 35000 },
  { name: "Apogee", interval: 35000 },
  { name: "Behringer_Midas", interval: 35000 },
  { name: "Sound_Devices", interval: 35000 },
  { name: "Luminex", interval: 40000 },
  { name: "Netgear_AV", interval: 40000 },
  { name: "d_b_audiotechnik", interval: 40000 },
  { name: "L_Acoustics", interval: 40000 },
  { name: "Meyer_Sound", interval: 40000 },
  { name: "Klark_Teknik", interval: 35000 },
  { name: "Kramer", interval: 35000 },
  { name: "ATEN", interval: 35000 },
  { name: "EmberPlus_Gateway", interval: 35000 },
  { name: "Unknown_Device", interval: 60000 } // Le test du Fallback
];

// Génération automatique du tableau devices
let currentIpSuffix = 121;
let currentMulticastSubnet = 10;

const devices = manufacturers.map(m => {
  const ip = `192.168.1.${currentIpSuffix++}`;
  const multicast = `239.69.${currentMulticastSubnet++}.1`;
  return {
    name: m.name,
    ip: ip,
    interval: m.interval,
    streams: [
      { name: `${m.name}_Main_Stream`, multicast: multicast }
    ]
  };
});

const generatePayload = (deviceName, deviceIp, streamName, multicastIp) => {
  return Buffer.from(
    'SAP_HEADER_MOCK\n' +
    'v=0\n' +
    `o=- 123456789 1 IN IP4 ${deviceIp}\n` +
    `s=${streamName}\n` +
    `i=${deviceName}\n` +
    `c=IN IP4 ${multicastIp}\n` +
    't=0 0\n' +
    'm=audio 5004 RTP/AVP 97\n' +
    'a=rtpmap:97 L24/48000/2\n' +
    'a=recvonly'
  );
};

server.on('error', (err) => {
  console.error(`Simulator error:\n${err.stack}`);
  server.close();
});

server.on('listening', () => {
  const address = server.address();
  console.log(`🚀 Multi-Vendor Simulator active on ${address.address}:${address.port}`);
  console.log(`📡 Simulating ${devices.length} distinct AES67 endpoints (from 192.168.1.121)...`);

  // Setup independent loops
  devices.forEach(device => {
    // Initial send so we don't wait for the first interval
    device.streams.forEach(stream => {
      const payload = generatePayload(device.name, device.ip, stream.name, stream.multicast);
      server.send(payload, 0, payload.length, PORT, MULTICAST_ADDR, (err) => {
        if (err) console.error(`Error sending ${stream.name}:`, err);
      });
    });

    setInterval(() => {
      device.streams.forEach(stream => {
        const payload = generatePayload(device.name, device.ip, stream.name, stream.multicast);
        server.send(payload, 0, payload.length, PORT, MULTICAST_ADDR, (err) => {
          if (err) console.error(`Error sending ${stream.name}:`, err);
        });
      });
      console.log(`[${new Date().toLocaleTimeString()}] Sent ${device.name} SAP heartbeats (${device.ip}) @ ${device.interval}ms`);
    }, device.interval);
  });

  // PTP Clock Heartbeat (Global)
  setInterval(() => {
    const ptpPayload = Buffer.from('PTP_MOCK|Grandmaster_StudioA|192.168.1.100');
    server.send(ptpPayload, 0, ptpPayload.length, PTP_PORT, PTP_MULTICAST_ADDR);
  }, 2000);
});

server.bind(() => {
  server.setBroadcast(true);
});