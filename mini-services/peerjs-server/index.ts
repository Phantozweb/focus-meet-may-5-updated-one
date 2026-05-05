// Focus Meet — Local PeerJS Signaling Server
// Runs on port 9001 as a reliable signaling relay

import { PeerServer } from 'peer';

const PORT = 9001;

const server = PeerServer({
  port: PORT,
  path: '/focusmeet',
  allow_discovery: true,
  concurrent_limit: 5000,
  alive_timeout: 60000,
  expire_timeout: 30000,
  key: 'focusmeet',
} as any);

server.on('connection', (client: any) => {
  console.log(`[PeerJS] Client connected: ${client.id}`);
});

server.on('disconnect', (client: any) => {
  console.log(`[PeerJS] Client disconnected: ${client.id}`);
});

server.on('error', (err: any) => {
  console.error(`[PeerJS] Server error:`, err);
});

console.log(`[Focus Meet] PeerJS signaling server running on port ${PORT}`);
