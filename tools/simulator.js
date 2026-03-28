import dgram from 'node:dgram';

const MULTICAST_ADDR = '239.255.255.255';
const PTP_MULTICAST_ADDR = '224.0.1.129';
const PORT = 9875;
const PTP_PORT = 320;
const INTERVAL = 2000;

const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

// Définition de 3 appareils avec leurs streams
const devices = [
  {
    name: "Console_FOH",
    ip: "192.168.1.101",
    streams: [
      { name: "Main_L", multicast: "239.69.10.1" },
      { name: "Main_R", multicast: "239.69.10.2" },
      { name: "Sub_Basse", multicast: "239.69.10.3" },
    ]
  },
  {
    name: "Stagebox_A",
    ip: "192.168.1.102",
    streams: [
      { name: "Mic_1-4", multicast: "239.69.20.1" },
      { name: "Mic_5-8", multicast: "239.69.20.2" },
      { name: "Line_In", multicast: "239.69.20.3" },
      { name: "Returns", multicast: "239.69.20.4" },
    ]
  },
  {
    name: "Intercom_Sys",
    ip: "192.168.1.103",
    streams: [
      { name: "Director_Ch", multicast: "239.69.30.1" },
      { name: "Camera_Op", multicast: "239.69.30.2" },
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
  console.log(`Simulator listening on ${address.address}:${address.port}`);
  console.log(`Sending multi-device multicast packets to ${MULTICAST_ADDR}:${PORT}...`);
});

const sendPackets = () => {
  devices.forEach(device => {
    device.streams.forEach(stream => {
      const payload = generatePayload(device.name, device.ip, stream.name, stream.multicast);
      server.send(payload, 0, payload.length, PORT, MULTICAST_ADDR, (err) => {
        if (err) console.error(`Error sending ${stream.name}:`, err);
      });
    });
  });

  // Envoi d'un Master Clock PTP simulé
  const ptpPayload = Buffer.from('PTP_MOCK|Grandmaster_StudioA|192.168.1.100');
  server.send(ptpPayload, 0, ptpPayload.length, PTP_PORT, PTP_MULTICAST_ADDR, (err) => {
    if (err) console.error(`Error sending PTP:`, err);
  });

  console.log(`[${new Date().toLocaleTimeString()}] Sent 9 SDP streams and 1 PTP Master Clock.`);
};

server.bind(() => {
  server.setBroadcast(true);
  setInterval(sendPackets, INTERVAL);
});
