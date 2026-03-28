import dgram from 'node:dgram';

const MULTICAST_ADDR = '239.255.255.255';
const PTP_MULTICAST_ADDR = '224.0.1.129';
const PORT = 9875;
const PTP_PORT = 320;

const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

const devices = [
  {
    name: "Riedel_Bolero",
    ip: "192.168.1.10",
    interval: 5000,
    streams: [
      { name: "Bolero_Beltpacks", multicast: "239.69.10.1" },
    ]
  },
  {
    name: "Yamaha_CL5",
    ip: "192.168.1.20",
    interval: 30000,
    streams: [
      { name: "FOH_Matrix_1-2", multicast: "239.69.20.1" },
    ]
  },
  {
    name: "Merging_Horus",
    ip: "192.168.1.30",
    interval: 30000,
    streams: [
      { name: "Mic_Preamp_1-8", multicast: "239.69.30.1" },
    ]
  },
  {
    name: "Dante_AVIO",
    ip: "192.168.1.40",
    interval: 30000,
    streams: [
      { name: "Analog_Output", multicast: "239.69.40.1" },
    ]
  }
];

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
  console.log(`📡 Simulating ${devices.length} distinct AES67 endpoints...`);
  
  // Setup independent loops
  devices.forEach(device => {
    setInterval(() => {
        device.streams.forEach(stream => {
            const payload = generatePayload(device.name, device.ip, stream.name, stream.multicast);
            server.send(payload, 0, payload.length, PORT, MULTICAST_ADDR, (err) => {
                if (err) console.error(`Error sending ${stream.name}:`, err);
            });
        });
        console.log(`[${new Date().toLocaleTimeString()}] Sent ${device.name} SAP heartbeats (${device.interval}ms)`);
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
