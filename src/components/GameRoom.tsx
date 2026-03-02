import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store';
import { io, Socket } from 'socket.io-client';
import { Send, ArrowLeft, Info } from 'lucide-react';
import Board from './Board';

export default function GameRoom({ gameId, onLeave }: { gameId: string; onLeave: () => void }) {
  const { user } = useAuthStore();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [game, setGame] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.emit('join_game', gameId);

    fetch(`/api/games/${gameId}`)
      .then((res) => res.json())
      .then(setGame);

    fetch(`/api/games/${gameId}/messages`)
      .then((res) => res.json())
      .then(setMessages);

    newSocket.on('game_started', (data) => {
      setGame((prev: any) => ({ ...prev, player_black_id: data.player_black_id, status: 'playing' }));
    });

    newSocket.on('game_updated', (data) => {
      setGame((prev: any) => ({ ...prev, board_state: data.board, current_turn: data.current_turn }));
    });

    newSocket.on('game_over', (data) => {
      setGame((prev: any) => ({ ...prev, status: 'finished', winner: data.winner }));
    });

    newSocket.on('chat_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      newSocket.emit('leave_game', gameId);
      newSocket.disconnect();
    };
  }, [gameId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleMove = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    if (!socket || !game || game.status !== 'playing') return;
    socket.emit('move', { gameId, from, to, userId: user?.id });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat_message', {
      gameId,
      userId: user?.id,
      userName: user?.name,
      content: chatInput,
    });
    setChatInput('');
  };

  if (!game) return <div className="min-h-screen flex items-center justify-center bg-stone-100 text-stone-500">Đang tải...</div>;

  const isPlayer = game.player_red_id === user?.id || game.player_black_id === user?.id;
  const myColor = game.player_red_id === user?.id ? 'red' : game.player_black_id === user?.id ? 'black' : null;
  const isMyTurn = myColor === game.current_turn;

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col md:flex-row">
      <div className="flex-1 p-4 md:p-8 flex flex-col items-center justify-center bg-stone-200">
        <div className="w-full max-w-3xl flex justify-between items-center mb-6">
          <button onClick={onLeave} className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors bg-white px-4 py-2 rounded-xl shadow-sm">
            <ArrowLeft size={20} />
            Rời Bàn
          </button>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm">
            <Info size={20} className="text-blue-500" />
            <span className="font-medium text-stone-700">
              {game.status === 'waiting' ? 'Đang chờ đối thủ...' : 
               game.status === 'finished' ? `Trò chơi kết thúc (${game.winner === 'red' ? 'Đỏ' : 'Đen'} thắng)` :
               isMyTurn ? 'Đến lượt bạn' : 'Lượt đối thủ'}
            </span>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-xl">
          <Board 
            board={game.board_state} 
            onMove={handleMove} 
            myColor={myColor} 
            isMyTurn={isMyTurn && game.status === 'playing'} 
          />
        </div>
      </div>

      <div className="w-full md:w-96 bg-white border-l border-stone-200 flex flex-col shadow-2xl z-10">
        <div className="p-4 border-b border-stone-100 bg-stone-50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
            {game.id.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-stone-800">Phòng Chat</h3>
            <p className="text-xs text-stone-500">{isPlayer ? 'Người chơi' : 'Khán giả'}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => {
            const isMe = msg.user_id === user?.id;
            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-xs text-stone-400 mb-1 px-1">{msg.user_name}</span>
                <div className={`px-4 py-2 rounded-2xl max-w-[85%] ${isMe ? 'bg-red-500 text-white rounded-tr-sm' : 'bg-stone-100 text-stone-800 rounded-tl-sm'}`}>
                  {msg.content}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t border-stone-100 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Nhập tin nhắn..."
              className="flex-1 bg-stone-100 border-transparent focus:bg-white focus:border-red-300 focus:ring-2 focus:ring-red-200 rounded-xl px-4 py-2 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="bg-red-500 hover:bg-red-600 disabled:bg-stone-300 text-white p-2 rounded-xl transition-colors flex items-center justify-center w-10 h-10"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
