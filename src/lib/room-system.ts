// Focus Meet — Room System
// Generates Room IDs (FM-XXXX) and Access Tokens
// Manages room cards and webinar listings via GitHub API

export interface WebinarRoom {
  id: string;              // FM-XXXX format
  token: string;           // 6-char access token
  title: string;
  hostName: string;
  hostPeerId: string;
  status: 'live' | 'starting' | 'ended' | 'scheduled';
  participantCount: number;
  maxParticipants: number;
  createdAt: number;
  scheduledAt?: number;
  description?: string;
  tags?: string[];
}

// Generate a room ID in FM-XXXX format
export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let id = 'FM-';
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Generate a 6-character access token
export function generateAccessToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Validate room ID format
export function isValidRoomId(roomId: string): boolean {
  return /^FM-[A-HJ-NP-Z2-9]{4}$/i.test(roomId);
}

// Validate access token format
export function isValidToken(token: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/i.test(token);
}

// Normalize room ID to uppercase
export function normalizeRoomId(roomId: string): string {
  return roomId.toUpperCase().trim();
}

// Normalize token to uppercase
export function normalizeToken(token: string): string {
  return token.toUpperCase().trim();
}

// Demo rooms for landing page display
export function getDemoRooms(): WebinarRoom[] {
  return [
    {
      id: 'FM-A3K7',
      token: 'X9M2PK',
      title: 'Beyond Ortho-K: Myopia Management with Contact Lenses',
      hostName: 'Manish Bhagat',
      hostPeerId: '',
      status: 'scheduled',
      participantCount: 0,
      maxParticipants: 1000,
      createdAt: Date.now(),
      scheduledAt: new Date('2026-05-06T13:30:00Z').getTime(),
      description: 'Practical & affordable myopia management techniques, Ortho-K vs soft multifocal lenses, and fitting strategies.',
      tags: ['Myopia', 'Contact Lens', 'Ortho-K'],
    },
    {
      id: 'FM-BR92',
      token: 'H7N4QT',
      title: 'Pediatric Optometry Workshop',
      hostName: 'Dr. Arun Kumar',
      hostPeerId: '',
      status: 'scheduled',
      participantCount: 0,
      maxParticipants: 200,
      createdAt: Date.now(),
      scheduledAt: Date.now() + 172800000,
      description: 'Hands-on workshop for pediatric eye examinations and common conditions.',
      tags: ['Pediatric', 'Workshop'],
    },
    {
      id: 'FM-CX45',
      token: 'K3L8WR',
      title: 'Contact Lens Fitting Masterclass',
      hostName: 'Dr. Meena Iyer',
      hostPeerId: '',
      status: 'scheduled',
      participantCount: 0,
      maxParticipants: 1000,
      createdAt: Date.now(),
      scheduledAt: Date.now() + 86400000,
      description: 'Comprehensive guide to fitting specialty contact lenses including scleral lenses.',
      tags: ['Contact Lens', 'Masterclass'],
    },
    {
      id: 'FM-DJ67',
      token: 'P5R9VZ',
      title: 'Glaucoma Management Updates 2026',
      hostName: 'Dr. Ravi Patel',
      hostPeerId: '',
      status: 'scheduled',
      participantCount: 0,
      maxParticipants: 500,
      createdAt: Date.now(),
      scheduledAt: Date.now() + 259200000,
      description: 'New treatment protocols and monitoring strategies for glaucoma patients.',
      tags: ['Glaucoma', 'Treatment'],
    },
  ];
}

// GitHub API for room persistence
const GITHUB_REPO = 'sriramben/focus-meet-rooms';
const GITHUB_TOKEN = process.env.NEXT_PUBLIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';

export async function saveRoomToGitHub(room: WebinarRoom): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/rooms/${room.id}.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Room ${room.id} ${room.status}`,
        content: btoa(JSON.stringify(room, null, 2)),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function loadRoomsFromGitHub(): Promise<WebinarRoom[]> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/rooms`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (!response.ok) return [];
    const files = await response.json();
    const rooms: WebinarRoom[] = [];
    for (const file of files.slice(0, 20)) {
      try {
        const content = await fetch(file.download_url);
        const room = await content.json();
        rooms.push(room);
      } catch { /* skip invalid */ }
    }
    return rooms;
  } catch {
    return [];
  }
}
