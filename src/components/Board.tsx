import { useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface Piece {
  type: string;
  color: string;
  owner: string;
  isHidden: boolean;
}

interface BoardProps {
  board: (Piece | null)[][];
  onMove: (from: { x: number; y: number }, to: { x: number; y: number }) => void;
  myColor: string | null;
  isMyTurn: boolean;
}

const PIECE_LABELS: Record<string, { red: string; black: string }> = {
  general: { red: '帥', black: '將' },
  advisor: { red: '仕', black: '士' },
  elephant: { red: '相', black: '象' },
  horse: { red: '傌', black: '馬' },
  chariot: { red: '俥', black: '車' },
  cannon: { red: '炮', black: '砲' },
  pawn: { red: '兵', black: '卒' },
};

export default function Board({ board, onMove, myColor, isMyTurn }: BoardProps) {
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);

  const handleSquareClick = (x: number, y: number) => {
    if (!isMyTurn) return;

    const piece = board[y][x];

    if (selected) {
      if (selected.x === x && selected.y === y) {
        setSelected(null); // Deselect
        return;
      }
      
      const selectedPiece = board[selected.y][selected.x];
      // If clicking another piece of our own, select it instead
      if (piece && ((piece.isHidden && piece.owner === myColor) || (!piece.isHidden && piece.color === myColor))) {
        setSelected({ x, y });
        return;
      }

      // Otherwise, attempt to move
      onMove(selected, { x, y });
      setSelected(null);
    } else {
      // Select a piece
      if (piece && ((piece.isHidden && piece.owner === myColor) || (!piece.isHidden && piece.color === myColor))) {
        setSelected({ x, y });
      }
    }
  };

  // Render the board lines using SVG
  const renderBoardLines = () => {
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 900 1000" preserveAspectRatio="none">
        {/* Horizontal lines */}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1="50" y1={i * 100 + 50} x2="850" y2={i * 100 + 50} stroke="#8b5a2b" strokeWidth="3" />
        ))}
        {/* Vertical lines */}
        {Array.from({ length: 9 }).map((_, i) => (
          <g key={`v${i}`}>
            {/* Top half vertical lines */}
            <line x1={i * 100 + 50} y1="50" x2={i * 100 + 50} y2="450" stroke="#8b5a2b" strokeWidth="3" />
            {/* Bottom half vertical lines */}
            <line x1={i * 100 + 50} y1="550" x2={i * 100 + 50} y2="950" stroke="#8b5a2b" strokeWidth="3" />
            {/* Edge vertical lines connect across river */}
            {(i === 0 || i === 8) && (
              <line x1={i * 100 + 50} y1="450" x2={i * 100 + 50} y2="550" stroke="#8b5a2b" strokeWidth="3" />
            )}
          </g>
        ))}
        {/* Palaces */}
        {/* Top Palace */}
        <line x1="350" y1="50" x2="550" y2="250" stroke="#8b5a2b" strokeWidth="3" />
        <line x1="550" y1="50" x2="350" y2="250" stroke="#8b5a2b" strokeWidth="3" />
        {/* Bottom Palace */}
        <line x1="350" y1="750" x2="550" y2="950" stroke="#8b5a2b" strokeWidth="3" />
        <line x1="550" y1="750" x2="350" y2="950" stroke="#8b5a2b" strokeWidth="3" />
        
        {/* River text */}
        <text x="250" y="520" fontSize="50" fill="#8b5a2b" fontFamily="serif" opacity="0.6">楚 河</text>
        <text x="550" y="520" fontSize="50" fill="#8b5a2b" fontFamily="serif" opacity="0.6">漢 界</text>
      </svg>
    );
  };

  return (
    <div className={twMerge(
      "relative w-[320px] h-[360px] md:w-[480px] md:h-[540px] lg:w-[640px] lg:h-[720px] bg-[#f4e4c1] border-4 border-[#8b5a2b] p-4 rounded-sm shadow-inner",
      myColor === 'black' && "rotate-180"
    )}>
      <div className="relative w-full h-full">
        {renderBoardLines()}
        
        <div className="absolute inset-0 grid grid-cols-9 grid-rows-10">
          {board.map((row, y) =>
            row.map((piece, x) => {
              const isSelected = selected?.x === x && selected?.y === y;
              return (
                <div
                  key={`${x}-${y}`}
                  className="relative flex items-center justify-center cursor-pointer"
                  onClick={() => handleSquareClick(x, y)}
                >
                  {piece && (
                    <div
                      className={twMerge(
                        clsx(
                          "w-[85%] h-[85%] rounded-full flex items-center justify-center shadow-md border-2 transition-transform",
                          piece.isHidden ? "bg-[#e8d0a9] border-[#c4a47c]" : "bg-[#fffae6] border-[#d4b48c]",
                          !piece.isHidden && piece.color === 'red' ? "text-red-600" : "",
                          !piece.isHidden && piece.color === 'black' ? "text-stone-900" : "",
                          isSelected && "ring-4 ring-blue-400 scale-110 z-10",
                          !isSelected && "hover:scale-105",
                          myColor === 'black' && "rotate-180"
                        )
                      )}
                    >
                      {piece.isHidden ? (
                        <div className="w-full h-full rounded-full flex items-center justify-center opacity-80">
                          <span className="text-xl md:text-2xl lg:text-3xl font-bold text-[#b58b59]">?</span>
                        </div>
                      ) : (
                        <span className="text-xl md:text-3xl lg:text-4xl font-bold font-serif">
                          {PIECE_LABELS[piece.type][piece.color as 'red' | 'black']}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
