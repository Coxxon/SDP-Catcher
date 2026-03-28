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

// Topologie PTP Spécifique
const G_RIEDEL_ID = '00-1A-CA-FF-FE-AA-BB-CC';
const G_LUMINEX_ID = '00-d0-bb-ff-fe-11-22-33';

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

// Injection d'appareils pour topologie complexe
devices.push(
  { name: "Riedel_Artist_1024", ip: "192.168.1.10", interval: 10000, specificPtpId: G_RIEDEL_ID, streams: [{ name: "Artist_Coms_Main", multicast: "239.69.50.1" }] },
  { name: "Bolero_Antenna_BC", ip: "192.168.1.51", interval: 10000, specificPtpId: G_LUMINEX_ID, streams: [{ name: "Bolero_BC_Stream", multicast: "239.69.51.1" }] },
  { name: "Bolero_Antenna_TC", ip: "192.168.1.52", interval: 10000, specificPtpId: G_RIEDEL_ID, streams: [{ name: "Bolero_TC_Stream", multicast: "239.69.52.1" }] }
);

const generatePtpId = (ip) => {
  const parts = ip.split('.');
  const last = parseInt(parts[3]).toString(16).padStart(2, '0').toUpperCase();
  return `00-11-22-FF-FE-88-88-${last}`;
};

const generatePayload = (deviceName, deviceIp, streamName, multicastIp, specificPtpId) => {
  const ptpId = specificPtpId || generatePtpId(deviceIp);
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
    'a=ptime:1\n' +
    `a=ts-refclk:ptp=IEEE1588-2008:${ptpId}:0\n` +
    'a=recvonly'
  );
};

const createPtpAnnounceBuffer = (ptpId) => {
  const buf = Buffer.alloc(64);
  buf[0] = 0x0B; // Announce messageType
  // ClockIdentity offset 20
  const hex = ptpId.replace(/-/g, '');
  for (let i = 0; i < 8; i++) {
    buf[20 + i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return buf;
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
      const payload = generatePayload(device.name, device.ip, stream.name, stream.multicast, device.specificPtpId);
      server.send(payload, 0, payload.length, PORT, MULTICAST_ADDR, (err) => {
        if (err) console.error(`Error sending ${stream.name}:`, err);
      });
    });

    setInterval(() => {
      device.streams.forEach(stream => {
        const payload = generatePayload(device.name, device.ip, stream.name, stream.multicast, device.specificPtpId);
        server.send(payload, 0, payload.length, PORT, MULTICAST_ADDR, (err) => {
          if (err) console.error(`Error sending ${stream.name}:`, err);
        });
      });
      console.log(`[${new Date().toLocaleTimeString()}] Sent ${device.name} SAP heartbeats (${device.ip}) @ ${device.interval}ms`);
    }, device.interval);
  });

  // Dedicated PTP Announce Loop (Alternating Riedel/Luminex)
  let ptpToggle = true;
  const PTP_PORT = 320;
  const PTP_ADDR = '224.0.1.129';

  setInterval(() => {
    const ptpId = ptpToggle ? G_RIEDEL_ID : G_LUMINEX_ID;
    const ptpIp = ptpToggle ? '192.168.1.10' : '192.168.1.50';
    const buf = createPtpAnnounceBuffer(ptpId);
    
    // Note: To truly simulate, we'd need to bind to the correct source IP, 
    // but here we just send the payload. The backend will see the sender's real IP
    // UNLESS we mock the resolving IP in discovery_table (which we did).
    server.send(buf, 0, buf.length, PTP_PORT, PTP_ADDR, (err) => {
      if (err) console.error('Error sending PTP Announce:', err);
    });
    
    console.log(`[${new Date().toLocaleTimeString()}] Sent PTP Announce Buffer for ${ptpToggle ? "RIEDEL" : "LUMINEX"} (${ptpId})`);
    ptpToggle = !ptpToggle;
  }, 1000); // 1s
});

server.bind(() => {
  server.setBroadcast(true);
});