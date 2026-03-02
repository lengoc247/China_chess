import { useEffect, useState } from 'react';
import { useAuthStore } from '../store';
import { LogOut, Plus, Users } from 'lucide-react';

export default function Lobby({ onJoinGame }: { onJoinGame: (id: string) => void }) {
  const { user, logout } = useAuthStore();
  const [games, setGames] = useState<any[]>([]);

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchGames = async () => {
    const res = await fetch('/api/games');
    const data = await res.json();
    setGames(data);
  };

  const createGame = async () => {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id }),
    });
    const data = await res.json();
    onJoinGame(data.id);
  };

  const joinGame = async (gameId: string) => {
    await fetch(`/api/games/${gameId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id }),
    });
    onJoinGame(gameId);
  };

  return (
    <div className="min-h-screen bg-stone-100 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-4">
            <img src={user?.avatar} alt={user?.name} className="w-12 h-12 rounded-full border-2 border-red-100" />
            <div>
              <h2 className="text-xl font-bold text-stone-800">{user?.name}</h2>
              <p className="text-sm text-stone-500">Sẵn sàng thi đấu</p>
            </div>
          </div>
          <button onClick={logout} className="p-2 text-stone-400 hover:text-red-500 transition-colors">
            <LogOut />
          </button>
        </header>

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Users className="text-red-500" />
            Phòng Chơi
          </h1>
          <button
            onClick={createGame}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={20} />
            Tạo Bàn Mới
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {games.map((game) => (
            <div key={game.id} className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex justify-between items-center hover:shadow-md transition-shadow">
              <div>
                <p className="font-semibold text-stone-800 mb-1">Bàn #{game.id.slice(0, 6)}</p>
                <p className="text-sm text-stone-500">
                  Trạng thái: <span className={game.status === 'waiting' ? 'text-emerald-500' : 'text-amber-500'}>
                    {game.status === 'waiting' ? 'Đang chờ' : 'Đang chơi'}
                  </span>
                </p>
              </div>
              <button
                onClick={() => joinGame(game.id)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-medium transition-colors"
              >
                {game.status === 'waiting' && game.player_red_id !== user?.id ? 'Vào Chơi' : 'Vào Xem'}
              </button>
            </div>
          ))}
          {games.length === 0 && (
            <div className="col-span-full text-center py-12 text-stone-500 bg-white rounded-2xl border border-dashed border-stone-300">
              Chưa có bàn chơi nào. Hãy tạo bàn mới!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
