const dgram = require('dgram');

const MULTICAST_ADDR = '239.255.255.255';
const PORT = 9875;
const INTERVAL = 2000;

const payload = Buffer.from(
  'SAP_HEADER_MOCK\n' +
  'v=0\n' +
  'o=- 123456789 1 IN IP4 192.168.1.100\n' +
  's=Simulated_AES67_Console\n' +
  'c=IN IP4 239.69.10.20\n' +
  't=0 0\n' +
  'm=audio 5004 RTP/AVP 97\n' +
  'a=rtpmap:97 L24/48000/2\n' +
  'a=recvonly'
);

const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

server.on('error', (err) => {
  console.error(`Simulator error:\n${err.stack}`);
  server.close();
});

server.on('listening', () => {
  const address = server.address();
  console.log(`Simulator listening on ${address.address}:${address.port}`);
  console.log(`Sending multicast packets to ${MULTICAST_ADDR}:${PORT} every ${INTERVAL / 1000}s...`);
});

const sendPacket = () => {
  server.send(payload, 0, payload.length, PORT, MULTICAST_ADDR, (err) => {
    if (err) {
      console.error('Error sending packet:', err);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Packet sent to ${MULTICAST_ADDR}:${PORT}`);
    }
  });
};

server.bind(() => {
  server.setBroadcast(true);
  // Optional: server.addMembership(MULTICAST_ADDR); // Not strictly needed for sending
  setInterval(sendPacket, INTERVAL);
});
