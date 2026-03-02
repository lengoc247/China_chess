/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from './store';
import Login from './components/Login';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';

export default function App() {
  const { user } = useAuthStore();
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);

  if (!user) {
    return <Login />;
  }

  if (currentGameId) {
    return <GameRoom gameId={currentGameId} onLeave={() => setCurrentGameId(null)} />;
  }

  return <Lobby onJoinGame={(id) => setCurrentGameId(id)} />;
}
