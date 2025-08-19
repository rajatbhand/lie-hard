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
  roundStarted: boolean; // Whether the current round has been started (shows intro vs actual content)
  round1: {
    statements: Round1Statement[];
    currentStorytellerId: number | null;
    votingOpen: boolean;
    showResult: boolean;
    guesses: { [key: number]: 'TRUE' | 'LIE' | '' };
  };
  round2: {
    statements: string[]; // Array of 5 statements for part 1
    revealedStatements: boolean[]; // Array of 5 booleans for which statements are revealed
    revealOrder: number[]; // Array to track the order statements were revealed
    part: 'STATEMENTS' | 'GUESSING'; // Current part of round 2
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
    currentStorytellerId: number | null;
    currentStatements: string[]; // Current storyteller's 3 statements
    trueIndex: number; // Which statement is true (0, 1, or 2)
    nonPlayerGuesses: { [key: number]: number | null }; // Non-storyteller players' guesses (0, 1, or 2)
    votingOpen: boolean;
    showResult: boolean;
    completedStorytellers: number[]; // Array of player IDs who have completed their turn
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
    <div className="bg-black flex justify-center items-center h-screen w-screen">
      {/* The main 13:9 container - responsive for projector */}
      <div className="aspect-[13/9] w-full h-full max-w-[95vw] max-h-[95vh] bg-[#046322] text-white flex font-sans shadow-2xl relative">
        <main
          className={`h-full transition-all duration-500 ease-in-out ${
            gameState.showScoreboard ? 'w-[90%]' : 'w-full'
          }`}
        >
          {gameState.currentRound === 'LOBBY' && <LobbyScreen players={gameState.players} />}
          {gameState.currentRound === 'R1' && !gameState.roundStarted && <RoundIntro round="R1" />}
          {gameState.currentRound === 'R1' && gameState.roundStarted && <Round1Display gameState={gameState} />}
          {gameState.currentRound === 'R2' && !gameState.roundStarted && <RoundIntro round="R2" />}
          {gameState.currentRound === 'R2' && gameState.roundStarted && <Round2Display gameState={gameState} />}
          {gameState.currentRound === 'R3' && !gameState.roundStarted && <RoundIntro round="R3" />}
          {gameState.currentRound === 'R3' && gameState.roundStarted && <Round3Display gameState={gameState} />}
          {gameState.currentRound === 'R4' && !gameState.roundStarted && <RoundIntro round="R4" />}
          {gameState.currentRound === 'R4' && gameState.roundStarted && <Round4Display gameState={gameState} />}
          {gameState.currentRound === 'WINNER' && <WinnerScreen players={gameState.players} />}
        </main>

        {gameState.showScoreboard && <Scoreboard players={gameState.players} gameState={gameState} />}

        {gameState.showLeaderboardModal && <LeaderboardModal players={gameState.players} />}
      </div>
    </div>
  );
}

// --- ROUND & LOBBY COMPONENTS ---
const RoundIntro = ({ round }: { round: 'R1' | 'R2' | 'R3' | 'R4' }) => {
  const roundInfo = {
    R1: {
      name: "Better Call Bluff",
      description: "Players take turns making statements. The audience must guess whether each statement is true or false. Correct guesses earn points!"
    },
    R2: {
      name: "Phone Out, Cash In",
      description: "First, we'll show you 5 statements about a phone's resale value. Then players will guess the actual resale value. Closest guess wins!"
    },
    R3: {
      name: "Catch Me If You Can",
      description: "Each player presents 3 statements, but only one is true. Non-playing players guess which statement is true, then the audience votes. Correct guesses earn 3 points!"
    },
    R4: {
      name: "Faking Bad",
      description: "Players compete to prove they own a mysterious object. The audience votes on who they believe is the real owner!"
    }
  };

  const info = roundInfo[round];

  return (
    <div className="w-full h-full flex flex-col justify-center items-center bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl md:text-6xl lg:text-8xl font-bold text-[#F2C14E] mb-8">
          Round {round.slice(1)}
        </h1>
        <h2 className="text-3xl md:text-5xl lg:text-7xl font-bold text-white mb-8">
          {info.name}
        </h2>
        <p className="text-xl md:text-2xl lg:text-3xl text-gray-300 max-w-4xl mx-auto px-8 leading-relaxed">
          {info.description}
        </p>
      </div>
    </div>
  );
};

const Round1Display = ({ gameState }: { gameState: GameState }) => {
    if (gameState.round1.currentStorytellerId === null) {
      return (
        <div className="w-full h-full flex flex-col justify-center items-center bg-gray-900">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl lg:text-8xl font-bold text-[#F2C14E] mb-8">
              Round 1
            </h1>
            <h2 className="text-3xl md:text-5xl lg:text-7xl font-bold text-white mb-8">
              Better Call Bluff
            </h2>
            <p className="text-2xl md:text-3xl lg:text-4xl text-gray-300">
              Waiting for storyteller to be selected...
            </p>
          </div>
        </div>
      );
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
          ${gameState.round1.showResult ? (isTruth ? 'bg-green-800' : 'bg-red-800') : 'bg-gray-900'}
        `}
      >
        {/* Player Info */}
        <div className="text-center mb-8 z-10">
           {gameState.round1.showResult && (
            <h1 className={`text-9xl font-bold mb-4 ${isTruth ? 'text-green-300' : 'text-red-300'}`}>
              {isTruth ? 'TRUTH' : 'LIE'}
            </h1>
          )}
          <img src={storyteller.photo} alt={storyteller.name} className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-full mx-auto border-4 border-[#00A896] object-cover" />
          <p className="text-2xl md:text-3xl lg:text-4xl text-gray-400 mt-4">Statement from</p>
          <h1 className="text-4xl md:text-6xl lg:text-8xl font-bold text-[#F2C14E]">{storyteller.name}</h1>
        </div>
  
        {/* Statement Box */}
        <div className="relative w-[80%] text-center z-10">
            <svg className="w-full" viewBox="0 0 949 67" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M155.5 1L107 34.0015L155.5 66.003H823L871.5 34.0015L823 1H155.5Z" fill="#1E40AF"/>
                <path d="M0 34.0015H107M107 34.0015L155.5 1H823L871.5 34.0015M107 34.0015L155.5 66.003H823L871.5 34.0015M871.5 34.0015H949" stroke="#FFD900"/>
            </svg>
            <p className="absolute inset-0 flex items-center justify-center text-2xl md:text-4xl lg:text-5xl font-semibold px-8 md:px-20 lg:px-40">
                {statement.statement}
            </p>
        </div>
  
        {gameState.round1.votingOpen && (
          <div className="mt-8 md:mt-12 lg:mt-16 text-center z-20">
            <div className="bg-yellow-400 text-black text-2xl md:text-4xl lg:text-5xl font-bold py-2 md:py-3 px-6 md:px-12 rounded-lg mb-4 md:mb-6">
              VOTING OPEN
            </div>
            <div className="text-white text-xl md:text-2xl lg:text-3xl font-semibold">
              Voting lines are now open.<br />
              Press:<br />
              1. For "Truth"<br />
              2. For "Lie"
            </div>
          </div>
        )}
      </div>
    );
};

const LobbyScreen = ({ players }: { players: Player[] }) => (
  <div className="w-full h-full flex flex-col justify-center items-center bg-gray-900">
    <div className="text-center mb-8 md:mb-16">
      <img src="/logo.svg" alt="Lie Hard Logo" className="w-[300px] md:w-[400px] lg:w-[500px]"/>
    </div>
    <div className="flex flex-col md:flex-row gap-4 md:gap-8 lg:gap-16">
      {players.map(player => (
        <div key={player.id} className="text-center">
          <img src={player.photo} alt={player.name} className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-full border-4 border-[#00A896] object-cover" />
          <h2 className="mt-2 md:mt-4 text-xl md:text-2xl lg:text-3xl font-semibold text-white">{player.name}</h2>
        </div>
      ))}
    </div>
  </div>
);

const Round2Display = ({ gameState }: { gameState: GameState }) => {
  const { players, round2 } = gameState;
  const { part, statements, revealedStatements, revealOrder, guesses, actualValue, winnerId } = round2;

  // Part 1: Display Statements
  if (part === 'STATEMENTS') {
    // Ensure revealedStatements is properly initialized
    const safeRevealedStatements = revealedStatements || [];
    const safeRevealOrder = revealOrder || [];
    const hasRevealedStatements = safeRevealedStatements.some(revealed => revealed);
    
    return (
      <div className="w-full h-full flex flex-col justify-center items-center bg-gray-900">
        {hasRevealedStatements && statements.length > 0 && (
          <div className="text-center w-full max-w-6xl px-8">
            <div className="space-y-4 md:space-y-6 lg:space-y-8">
              {/* Display statements in reveal order */}
              {safeRevealOrder.map((statementIndex) => (
                <div 
                  key={statementIndex} 
                  className="relative transition-all duration-300 opacity-100"
                >
                  <div className="relative w-full text-center">
                    <svg className="w-full" viewBox="0 0 949 67" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M155.5 1L107 34.0015L155.5 66.003H823L871.5 34.0015L823 1H155.5Z" fill="#1E40AF"/>
                      <path d="M0 34.0015H107M107 34.0015L155.5 1H823L871.5 34.0015M107 34.0015L155.5 66.003H823L871.5 34.0015M871.5 34.0015H949" stroke="#FFD900"/>
                    </svg>
                    <p className="absolute inset-0 flex items-center justify-center text-lg md:text-2xl lg:text-3xl font-semibold px-8 md:px-20 lg:px-40">
                      {statements[statementIndex]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!hasRevealedStatements && (
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl lg:text-8xl font-bold text-[#F2C14E]">
              Round 2: Phone Out, Cash In
            </h1>
            <p className="text-2xl md:text-3xl lg:text-4xl text-gray-300 mt-8">
              Waiting for statements to be displayed...
            </p>
          </div>
        )}
      </div>
    );
  }

  // Part 2: Guessing
  return (
    <div className="w-full h-full flex flex-col justify-center items-center bg-gray-900">
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

  if (!storyteller || !round3.currentStatements || round3.currentStatements.length === 0) {
    return (
      <div className="w-full h-full flex flex-col justify-center items-center bg-gray-900">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl lg:text-8xl font-bold text-[#F2C14E] mb-8">
            Round 3: Catch Me If You Can
          </h1>
          <p className="text-2xl md:text-3xl lg:text-4xl text-gray-300">
            Waiting for storyteller to be selected...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col justify-center items-center bg-gray-900">
      {/* Storyteller Info */}
      <div className="flex items-center justify-center gap-4 mb-8 md:mb-12 lg:mb-16">
        <img src={storyteller.photo} alt={storyteller.name} className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full border-2 border-[#00A896] object-cover" />
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white">Storyteller: {storyteller.name}</h2>
      </div>

      {/* Statements Display */}
      <div className="text-center w-full max-w-6xl px-8">
        <div className="space-y-4 md:space-y-6 lg:space-y-8">
          {round3.currentStatements.map((statement, index) => {
            const isTrue = index === round3.trueIndex;
            const showAsTrue = round3.showResult && isTrue;
            
            return (
              <div 
                key={index} 
                className={`relative transition-all duration-500 ${
                  showAsTrue ? 'scale-105' : ''
                }`}
              >
                <div className="relative w-full text-center">
                  <svg 
                    className={`w-full ${showAsTrue ? 'animate-pulse' : ''}`} 
                    style={showAsTrue ? {
                      filter: 'drop-shadow(0 0 20px #22C55E) drop-shadow(0 0 30px #22C55E) drop-shadow(0 0 40px #22C55E)'
                    } : {}}
                    viewBox="0 0 949 67" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M155.5 1L107 34.0015L155.5 66.003H823L871.5 34.0015L823 1H155.5Z" fill={round3.showResult ? (showAsTrue ? "#22C55E" : "#DC2626") : "#1E40AF"}/>
                    <path 
                      d="M0 34.0015H107M107 34.0015L155.5 1H823L871.5 34.0015M107 34.0015L155.5 66.003H823L871.5 34.0015M871.5 34.0015H949" 
                      stroke={round3.showResult ? (showAsTrue ? "#22C55E" : "#DC2626") : "#FFD900"}
                      strokeWidth={round3.showResult ? "4" : "2"}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-start px-8 md:px-20 lg:px-40">
                    <span className="text-lg md:text-2xl lg:text-3xl font-bold text-[#F2C14E] mr-4 md:mr-6 lg:mr-8">
                      {index + 1}.
                    </span>
                    <p className="text-lg md:text-2xl lg:text-3xl font-semibold text-white flex-1 text-left">
                      {statement}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>



      {/* Voting Open Message */}
      {round3.votingOpen && (
        <div className="mt-8 md:mt-12 lg:mt-16 text-center z-20">
          <div className="bg-yellow-400 text-black text-2xl md:text-4xl lg:text-5xl font-bold py-2 md:py-3 px-6 md:px-12 rounded-lg mb-4 md:mb-6">
            VOTING OPEN
          </div>
          <div className="text-white text-xl md:text-2xl lg:text-3xl font-semibold">
            Voting lines are now open.<br />
            Press:<br />
            1. For "Statement 1"<br />
            2. For "Statement 2"<br />
            3. For "Statement 3"
          </div>
        </div>
      )}
    </div>
  );
};

const Round4Display = ({ gameState }: { gameState: GameState }) => {
  const { players, round4 } = gameState;
  const winner = players.find(p => p.id === round4.winnerId);
  const realOwner = players.find(p => p.id === round4.realOwnerId);

  return (
    <div className="text-center relative w-full h-full flex flex-col justify-center items-center bg-gray-900">
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
          <img src={player.photo} alt={player.name} className="w-32 h-32 rounded-full border-4 border-blue-400 object-cover shadow-xl" />
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
        <aside className="w-[10%] p-4 bg-gray-900 border-l-2 border-white border-opacity-20">
            <h2 className="text-center text-3xl font-bold mb-6 text-[#F2C14E]">Players</h2>
            <div className="grid gap-4">
                {players.map(player => {
                    const round1Guess = gameState.round1.guesses ? gameState.round1.guesses[player.id] : '';
                    const isRound1Storyteller = player.id === gameState.round1.currentStorytellerId;
                    
                    // Round 3 specific logic
                    const isRound3Storyteller = gameState.currentRound === 'R3' && player.id === gameState.round3.currentStorytellerId;
                    const round3Guess = gameState.currentRound === 'R3' && gameState.round3.nonPlayerGuesses ? 
                        gameState.round3.nonPlayerGuesses[player.id] : null;

                    return (
                        <div key={player.id} className={`p-2 rounded-lg transition-all ${
                            isRound1Storyteller || isRound3Storyteller ? 'bg-yellow-400 text-black' : ''
                        }`}>
                            <div className="flex items-center gap-3">
                                <img src={player.photo} alt={player.name} className="w-12 h-12 rounded-full object-cover border-2 border-gray-400 shadow-lg flex-shrink-0" />
                                <div>
                                    <p className={`font-bold text-lg ${isRound1Storyteller || isRound3Storyteller ? 'text-black' : 'text-white'}`}>{player.name}</p>
                                    <p className={`text-lg ${isRound1Storyteller || isRound3Storyteller ? 'text-gray-800' : 'text-gray-300'}`}>{player.score}</p>
                                </div>
                            </div>
                            
                            {/* Round 1 Guess */}
                            {gameState.currentRound === 'R1' && !isRound1Storyteller && round1Guess && (
                                <div className="mt-2 text-center">
                                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${round1Guess === 'TRUE' ? 'bg-green-500' : 'bg-red-500'}`}>
                                        {round1Guess}
                                    </span>
                                </div>
                            )}
                            
                            {/* Round 3 Guess */}
                            {gameState.currentRound === 'R3' && !isRound3Storyteller && round3Guess !== null && (
                                <div className="mt-2 text-center">
                                    <span className="px-3 py-1 text-sm font-bold rounded-full bg-blue-500 text-white">
                                        {round3Guess + 1}
                                    </span>
                                </div>
                            )}
                            
                            {/* Round 3 Storyteller indicator */}
                            {gameState.currentRound === 'R3' && isRound3Storyteller && (
                                <div className="mt-2 text-center">
                                    <span className="px-3 py-1 text-sm font-bold rounded-full bg-yellow-500 text-black">
                                        Storyteller
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
