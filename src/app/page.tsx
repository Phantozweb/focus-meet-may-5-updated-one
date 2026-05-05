'use client';

import { useState, useEffect } from 'react';
import { LandingPage } from '@/components/focus-meet/LandingPage';
import { RoomPage } from '@/components/focus-meet/RoomPage';

export default function Home() {
  const [inRoom, setInRoom] = useState(false);

  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      setInRoom(hash.includes('room='));
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  if (inRoom) {
    return <RoomPage />;
  }

  return <LandingPage />;
}
