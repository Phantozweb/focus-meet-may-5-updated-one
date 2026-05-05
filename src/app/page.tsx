'use client';

import { useState, useEffect } from 'react';
import { LandingPage } from '@/components/focus-meet/LandingPage';
import { RoomPage } from '@/components/focus-meet/RoomPage';

type PageView = 'landing' | 'room' | 'login';

export default function Home() {
  const [view, setView] = useState<PageView>('landing');

  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash.includes('room=')) {
        setView('room');
      } else if (hash === '#login' || hash.includes('login=true')) {
        setView('login');
      } else {
        setView('landing');
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  if (view === 'room') {
    return <RoomPage />;
  }

  if (view === 'login') {
    return <LandingPage showLoginOnMount />;
  }

  return <LandingPage />;
}
