// src/app/display/page.tsx
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

// --- TYPES ---
interface Player {
  id: number;
  name: string;
  score: number;
  photo: string;
}

interface Round1Statement {
  playerId: number;
  playerName: string; // Add playerName
  statement: string;
  isTruth: boolean;
}

interface GameState {
  currentRound: 'LOBBY' | 'R1' | 'R2' | 'R3' | 'R4' | 'WINNER';
  players: Player[];
  showScoreboard: boolean;
  showLeaderboardModal: boolean;
  round1: {
    statements: Round1Statement[];
    currentStorytellerId: number | null;
    votingOpen: boolean;
    showResult: boolean;
    guesses: { [key: number]: 'TRUE' | 'LIE' | '' };
  };
  round2: {
    guesses: { [key: number]: number | null };
    actualValue: number | null;
    winnerId: number | null;
  };
  round3: {
    sets: {
      playerId: number;
      statements: string[];
      trueIndex: number;
    }[];
    currentStorytellerId: number;
    votingOpen: boolean;
    showResult: boolean;
  };
  round4: {
    objectTitle: string;
    objectImage: string;
    realOwnerId: number;
    winnerId: number | null;
    showRealOwner: boolean;
  };
}

// --- MAIN COMPONENT ---
export default function DisplayPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    const docRef = doc(db, 'gameState', 'live');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data() as GameState);
      } else {
        console.log('No such document!');
      }
    });
    return () => unsubscribe();
  }, []);

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        Loading Game State...
      </div>
    );
  }

  return (
    <div className="bg-black flex justify-center items-center h-screen">
      {/* The main 13:9 container */}
      <div className="aspect-[13/9] h-full bg-[#046322] text-white flex font-sans shadow-2xl relative">
        <main
          className={`h-full transition-all duration-500 ease-in-out ${
            gameState.showScoreboard ? 'w-[90%]' : 'w-full'
          }`}
        >
          {gameState.currentRound === 'LOBBY' && <LobbyScreen players={gameState.players} />}
          {gameState.currentRound === 'R1' && <Round1Display gameState={gameState} />}
          {gameState.currentRound === 'R2' && <Round2Display gameState={gameState} />}
          {gameState.currentRound === 'R3' && <Round3Display gameState={gameState} />}
          {gameState.currentRound === 'R4' && <Round4Display gameState={gameState} />}
          {gameState.currentRound === 'WINNER' && <WinnerScreen players={gameState.players} />}
        </main>

        {gameState.showScoreboard && <Scoreboard players={gameState.players} gameState={gameState} />}

        {gameState.showLeaderboardModal && <LeaderboardModal players={gameState.players} />}
      </div>
    </div>
  );
}

// --- ROUND & LOBBY COMPONENTS ---
const Round1Display = ({ gameState }: { gameState: GameState }) => {
    if (gameState.round1.currentStorytellerId === null) {
      return <div className="w-full h-full flex justify-center items-center text-5xl">Waiting for storyteller...</div>;
    }
  
    const storyteller = gameState.players.find(p => p.id === gameState.round1.currentStorytellerId);
    const statement = gameState.round1.statements.find(s => s.playerId === gameState.round1.currentStorytellerId);
  
    if (!storyteller || !statement) {
      return <div className="w-full h-full flex justify-center items-center text-5xl">Error: Storyteller or statement not found.</div>;
    }
  
    const isTruth = statement.isTruth;
  
    return (
      <div 
        className={`w-full h-full flex flex-col justify-center items-center relative transition-colors duration-300
          ${gameState.round1.showResult ? (isTruth ? 'bg-green-800' : 'bg-red-800') : 'bg-transparent'}
        `}
      >
        {/* Player Info */}
        <div className="text-center mb-8 z-10">
           {gameState.round1.showResult && (
            <h1 className={`text-9xl font-bold mb-4 ${isTruth ? 'text-green-300' : 'text-red-300'}`}>
              {isTruth ? 'TRUTH' : 'LIE'}
            </h1>
          )}
          <img src={storyteller.photo} alt={storyteller.name} className="w-32 h-32 rounded-full mx-auto border-4 border-[#00A896] object-cover" />
          <p className="text-3xl text-gray-400 mt-4">Statement from</p>
          <h1 className="text-6xl font-bold text-[#F2C14E]">{storyteller.name}</h1>
        </div>
  
        {/* Statement Box */}
        <div className="relative w-[80%] text-center z-10">
            <svg className="w-full" viewBox="0 0 949 67" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M155.5 1L107 34.0015L155.5 66.003H823L871.5 34.0015L823 1H155.5Z" fill="#0C5D22"/>
                <path d="M0 34.0015H107M107 34.0015L155.5 1H823L871.5 34.0015M107 34.0015L155.5 66.003H823L871.5 34.0015M871.5 34.0015H949" stroke="#FFD900"/>
            </svg>
            <p className="absolute inset-0 flex items-center justify-center text-4xl font-semibold px-40">
                {statement.statement}
            </p>
        </div>
  
        {gameState.round1.votingOpen && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-4xl font-bold py-3 px-12 rounded-lg z-20">
              VOTING OPEN
          </div>
        )}
      </div>
    );
};

const LobbyScreen = ({ players }: { players: Player[] }) => (
  <div className="w-full h-full flex flex-col justify-center items-center">
    <div className="text-center mb-16">
      <img src="/logo.svg" alt="Lie Hard Logo" className="w-[500px]"/>
    </div>
    <div className="flex gap-16">
      {players.map(player => (
        <div key={player.id} className="text-center">
          <img src={player.photo} alt={player.name} className="w-40 h-40 rounded-full border-4 border-[#00A896] object-cover" />
          <h2 className="mt-4 text-3xl font-semibold text-white">{player.name}</h2>
        </div>
      ))}
    </div>
  </div>
);

const Round2Display = ({ gameState }: { gameState: GameState }) => {
  const { players, round2 } = gameState;
  const { guesses, actualValue, winnerId } = round2;

  return (
    <div className="w-full h-full flex flex-col justify-center items-center">
      <div className="grid grid-cols-2 gap-x-16 gap-y-8">
        {players.map(player => (
          <div 
            key={player.id} 
            className={`text-center transition-all duration-500 ${winnerId === player.id ? 'scale-110' : ''}`}
          >
            <p className="text-3xl font-semibold">{player.name}</p>
            <div 
              className={`mt-2 p-4 border-2 rounded-lg w-80 text-5xl font-bold
                ${winnerId === player.id ? 'bg-green-500 border-green-300' : 'bg-black bg-opacity-30 border-[#00A896]'}
              `}
            >
              {guesses[player.id] ? `₹${guesses[player.id]?.toLocaleString()}` : '₹ ?'}
            </div>
          </div>
        ))}
      </div>
      
      {actualValue !== null && (
        <div className="mt-16 text-center animate-fade-in">
          <h2 className="text-4xl text-gray-300">Actual Resale Value</h2>
          <p className="text-8xl font-bold text-[#F2C14E] mt-2">₹{actualValue.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
};

const Round3Display = ({ gameState }: { gameState: GameState }) => {
  const { players, round3 } = gameState;
  const storyteller = players.find(p => p.id === round3.currentStorytellerId);
  const set = round3.sets.find(s => s.playerId === round3.currentStorytellerId);

  if (!storyteller || !set) return <div>Error: Data not found for Round 3.</div>;

  return (
    <div className="text-center relative w-full h-full flex flex-col justify-center items-center">
      <div className="flex items-center justify-center gap-4 mb-8">
        <img src={storyteller.photo} alt={storyteller.name} className="w-20 h-20 rounded-full border-2 border-[#00A896]" />
        <h2 className="text-3xl">Storyteller: {storyteller.name}</h2>
      </div>
      <div className="flex gap-8 justify-center">
        {set.statements.map((statement, index) => {
          const isTrue = index === set.trueIndex;
          const showAsTrue = round3.showResult && isTrue;
          const showAsFalse = round3.showResult && !isTrue;

          return (
            <div 
              key={index} 
              className={`p-8 border-2 rounded-lg w-96 h-96 flex flex-col justify-center items-center shadow-lg transition-all duration-500
                ${showAsTrue ? 'bg-green-500 border-green-300 scale-105' : 'bg-black bg-opacity-30 border-[#00A896]'}
                ${showAsFalse ? 'opacity-50' : ''}
              `}
            >
              <div className="text-7xl font-bold text-[#F2C14E] mb-6">{index + 1}</div>
              <p className="text-3xl">{statement}</p>
            </div>
          );
        })}
      </div>
      {round3.votingOpen && <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white py-2 px-8 rounded-lg font-bold">VOTING OPEN</div>}
    </div>
  );
};

const Round4Display = ({ gameState }: { gameState: GameState }) => {
  const { players, round4 } = gameState;
  const winner = players.find(p => p.id === round4.winnerId);
  const realOwner = players.find(p => p.id === round4.realOwnerId);

  return (
    <div className="text-center relative w-full h-full flex flex-col justify-center items-center">
      <div className="bg-black bg-opacity-30 p-8 border-2 border-[#E94560] rounded-lg shadow-xl">
        <img src={round4.objectImage} alt={round4.objectTitle} className="max-w-md max-h-96 mx-auto" />
        <h2 className="text-4xl font-semibold mt-6 text-[#F2C14E]">{round4.objectTitle}</h2>

        {round4.showRealOwner && realOwner && (
          <div className="mt-4 text-2xl bg-yellow-400 text-black inline-block px-4 py-2 rounded font-bold">
            Real Owner: <strong>{realOwner.name}</strong>
          </div>
        )}
      </div>

      {winner && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col justify-center items-center animate-fade-in">
          <h1 className="text-9xl font-bold text-white animate-pulse">WINNER!</h1>
          <img src={winner.photo} alt={winner.name} className="w-56 h-56 rounded-full my-8 border-8 border-green-400"/>
          <h2 className="text-7xl font-bold text-green-400">{winner.name}</h2>
        </div>
      )}
    </div>
  );
};

const LeaderboardModal = ({ players }: { players: Player[] }) => (
  <div className="absolute inset-0 bg-black bg-opacity-90 flex flex-col justify-center items-center animate-fade-in z-50">
    <h1 className="text-8xl font-bold text-yellow-400 mb-16">Player Scores</h1>
    <div className="grid grid-cols-2 gap-x-32 gap-y-12">
      {players.sort((a, b) => b.score - a.score).map(player => (
        <div key={player.id} className="flex items-center gap-8 w-[500px]">
          <img src={player.photo} alt={player.name} className="w-32 h-32 rounded-full border-4 border-blue-400" />
          <div className="text-left">
            <h2 className="text-5xl font-bold">{player.name}</h2>
            <p className="text-4xl text-gray-300">{player.score} Points</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const Scoreboard = ({ players, gameState }: { players: Player[], gameState: GameState }) => {
    return (
        <aside className="w-[10%] p-4 bg-black bg-opacity-20 border-l-2 border-white border-opacity-20">
            <h2 className="text-center text-3xl font-bold mb-6 text-[#F2C14E]">Players</h2>
            <div className="grid gap-4">
                {players.map(player => {
                    const guess = gameState.round1.guesses ? gameState.round1.guesses[player.id] : '';
                    const isStoryteller = player.id === gameState.round1.currentStorytellerId;

                    return (
                        <div key={player.id} className={`p-2 rounded-lg transition-all ${isStoryteller ? 'bg-yellow-400 text-black' : ''}`}>
                            <div className="flex items-center gap-3">
                                <img src={player.photo} alt={player.name} className="w-12 h-12 rounded-full object-cover border-2 border-gray-400" />
                                <div>
                                    <p className={`font-bold text-lg ${isStoryteller ? 'text-black' : 'text-white'}`}>{player.name}</p>
                                    <p className={`text-lg ${isStoryteller ? 'text-gray-800' : 'text-gray-300'}`}>{player.score}</p>
                                </div>
                            </div>
                            {!isStoryteller && guess && (
                                <div className="mt-2 text-center">
                                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${guess === 'TRUE' ? 'bg-green-500' : 'bg-red-500'}`}>
                                        {guess}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
};

// --- WINNER COMPONENT ---
const WinnerScreen = ({ players }: { players: Player[] }) => {
    const highScore = Math.max(...players.map(p => p.score));
    const winners = players.filter(p => p.score === highScore);
  
    return (
      <div className="w-full h-full flex flex-col justify-center items-center text-center bg-gradient-to-b from-blue-900 to-black">
        <h1 className="text-9xl font-bold text-yellow-400 animate-pulse">
          {winners.length > 1 ? 'WINNERS!' : 'WINNER!'}
        </h1>
        <div className="flex gap-16 my-12">
          {winners.map(winner => (
            <div key={winner.id} className="flex flex-col items-center">
              <img src={winner.photo} alt={winner.name} className="w-64 h-64 rounded-full border-8 border-yellow-400 object-cover" />
              <h2 className="text-7xl font-bold mt-4">{winner.name}</h2>
            </div>
          ))}
        </div>
        <p className="text-5xl">with a score of</p>
        <p className="text-8xl font-bold text-yellow-400">{highScore} Points</p>
        {/* Basic confetti effect */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(50)].map((_, i) => (
            <div key={i} className="absolute bg-yellow-300 w-4 h-4 rounded-full animate-fall" style={{ left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 5}s`, animationDuration: `${2 + Math.random() * 3}s` }}></div>
          ))}
        </div>
      </div>
    );
};
