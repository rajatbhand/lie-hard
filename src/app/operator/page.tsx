// src/app/operator/page.tsx
"use client";

import { db } from "@/lib/firebase";
import { doc, setDoc, updateDoc, getDoc, onSnapshot } from "firebase/firestore";
import { useState, useEffect, ChangeEvent } from "react";
import Papa from "papaparse";

// --- TYPES ---
interface Player {
  id: number;
  name: string;
  score: number;
  photo: string;
}

interface Round1Statement {
  playerId: number;
  playerName: string; // Add playerName to match display page
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
    guesses: { [key: number]: 'TRUE' | 'LIE' | '' }; // New field
    votingOpen: boolean;
    showResult: boolean;
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


// --- MOCK DATA ---
const initialPlayers: Player[] = [
  { id: 1, name: "Baneet", score: 0, photo: "/player1.png" },
  { id: 2, name: "Gaurav", score: 0, photo: "/player2.png" },
  { id: 3, name: "Player 3", score: 0, photo: "/player3.png" },
  { id: 4, name: "Player 4", score: 0, photo: "/player4.png" },
];

// REMOVE hardcoded statements for R1 and R3
const initialGameState: GameState = {
  currentRound: "LOBBY",
  players: initialPlayers,
  showScoreboard: true,
  showLeaderboardModal: false,
  round1: {
    statements: [], // Now starts empty
    currentStorytellerId: null, // Changed from 1 to null
    guesses: { 1: '', 2: '', 3: '', 4: '' }, // New field
    votingOpen: false,
    showResult: false,
  },
  round2: {
    guesses: { 1: null, 2: null, 3: null, 4: null },
    actualValue: null,
    winnerId: null,
  },
  round3: {
    sets: [], // Now starts empty
    currentStorytellerId: 1,
    votingOpen: false,
    showResult: false,
  },
  round4: {
    objectTitle: "A Well-Loved Stuffed Bear",
    objectImage: "/bear.png",
    realOwnerId: 2, // Gaurav
    winnerId: null,
    showRealOwner: false,
  },
};

export default function OperatorPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [correctGuessers, setCorrectGuessers] = useState<Record<number, boolean>>({});
  const [r2Guesses, setR2Guesses] = useState<Record<number, string>>({ 1: '', 2: '', 3: '', 4: '' });
  const [r2ActualValue, setR2ActualValue] = useState<string>('');
  const [r3CorrectGuessers, setR3CorrectGuessers] = useState<Record<number, boolean>>({});
  const [round1Data, setRound1Data] = useState<Round1Statement[]>([]);
  const [round3Data, setRound3Data] = useState<any[]>([]); // Using 'any' for now for R3 structure

  useEffect(() => {
    // Listen to game state changes to make the operator panel reactive
    const unsub = onSnapshot(doc(db, "gameState", "live"), (doc) => {
      if (doc.exists()) {
        setGameState(doc.data() as GameState);
      } else {
        console.log("No game state document found - initializing...");
        // Initialize the game state if it doesn't exist
        initializeGame();
      }
    });
    return () => unsub();
  }, []);

  const updateGameState = async (newState: object) => {
    // This function works well for top-level updates like changing the current round
    try {
      await updateDoc(doc(db, "gameState", "live"), newState);
    } catch (error) {
      console.error("Error updating game state: ", error);
      alert("Error updating game. See console.");
    }
  };
  
  const updateRound1State = async (newRound1State: object) => {
    try {
      const docRef = doc(db, "gameState", "live");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const currentGameState = docSnap.data() as GameState;
        const updatedRound1State = { ...currentGameState.round1, ...newRound1State };
        await updateDoc(docRef, { round1: updatedRound1State });
      }
    } catch (e) {
      console.error("Error updating Round 1 state: ", e);
      alert("Error updating Round 1 state");
    }
  };



  const initializeGame = async () => {
    try {
      await setDoc(doc(db, "gameState", "live"), initialGameState);
      alert("Game Initialized to Lobby State!");
    } catch (error) {
      console.error("Error initializing game: ", error);
    }
  };

  const awardPointsR1 = async () => {
    const docRef = doc(db, "gameState", "live");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const currentGameState = docSnap.data() as GameState;
      const updatedPlayers = currentGameState.players.map((player) => {
        if (correctGuessers[player.id]) {
          return { ...player, score: player.score + 1 };
        }
        return player;
      });

      await updateDoc(docRef, { players: updatedPlayers });
      setCorrectGuessers({});
      alert("Points awarded!");
    } else {
      alert("Error: Game state not found.");
    }
  };

  const handleGuesserToggle = (playerId: number) => {
    setCorrectGuessers(prev => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  const handleR2GuessChange = (playerId: number, value: string) => {
    setR2Guesses(prev => ({ ...prev, [playerId]: value }));
    // This updates Firebase as you type (on blur)
    updateGameState({ [`round2.guesses.${playerId}`]: Number(value) || null });
  };
  
  const revealR2ActualValue = async () => {
    await updateGameState({ 'round2.actualValue': Number(r2ActualValue) });
    alert("Actual value has been revealed on the display.");
  };

  const revealR2Winner = async () => {
    // This function is the same as the old calculateR2Winner
    const docRef = doc(db, "gameState", "live");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const gameState = docSnap.data() as GameState;
      const { players, round2 } = gameState;
      const { guesses, actualValue } = round2;

      if (actualValue === null) {
        alert("Please set the actual value before revealing a winner.");
        return;
      }

      let winnerId = -1;
      let minDiff = Infinity;

      players.forEach(player => {
        const guess = guesses[player.id];
        if (guess !== null) {
          const diff = Math.abs(guess - actualValue);
          if (diff < minDiff) {
            minDiff = diff;
            winnerId = player.id;
          }
        }
      });
      
      // TODO: Add manual override for ties

      // Award points
      const updatedPlayers = players.map(p => 
        p.id === winnerId ? { ...p, score: p.score + 4 } : p
      );

      await updateGameState({
        'round2.winnerId': winnerId,
        players: updatedPlayers
      });
      
      alert(`${players.find(p => p.id === winnerId)?.name} wins Round 2!`);

    } else {
      alert("Error: Game state not found.");
    }
  };

  const awardPointsR3 = async () => {
    const docRef = doc(db, "gameState", "live");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const currentGameState = docSnap.data() as GameState;
      const updatedPlayers = currentGameState.players.map(player => {
        if (r3CorrectGuessers[player.id]) {
          return { ...player, score: player.score + 3 };
        }
        return player;
      });

      await updateDoc(docRef, { players: updatedPlayers });
      setR3CorrectGuessers({}); // Reset checkboxes
      alert("Points awarded for Round 3!");
    } else {
      alert("Error: Game state not found.");
    }
  };

  const handleFileParse = (event: ChangeEvent<HTMLInputElement>, round: 'R1' | 'R3') => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (round === 'R1') {
            const processedData = results.data.map((row: any) => ({
              playerId: parseInt(row.playerId, 10),
              playerName: row.playerName, // Added playerName
              statement: row.statement,
              isTruth: row.isTruth.toUpperCase() === 'TRUE',
            }));
            setRound1Data(processedData as Round1Statement[]);
            alert(`Round 1: ${processedData.length} statements loaded.`);
          } else if (round === 'R3') {
            const processedData = results.data.map((row: any) => ({
              playerId: parseInt(row.playerId, 10),
              statements: [row.statement_1, row.statement_2, row.statement_3],
              trueIndex: parseInt(row.true_index, 10),
            }));
            setRound3Data(processedData);
            alert(`${processedData.length} statement sets for Round 3 loaded successfully.`);
          }
        } catch (error) {
          alert("Error processing CSV data. Please check file format and content.");
          console.error("CSV Processing Error:", error);
        }
      },
      error: (error) => {
        alert(`Error parsing ${round} CSV: ${error.message}`);
      }
    });
  };

  const importCsvData = async () => {
    if (round1Data.length === 0 || round3Data.length === 0) {
      alert("Please upload files for both Round 1 and Round 3 before importing.");
      return;
    }
    try {
      // Create a fresh copy of the initial game state
      const newGameState = { ...initialGameState };
      
      // Overwrite the statement and set arrays with the parsed data
      newGameState.round1.statements = round1Data;
      newGameState.round3.sets = round3Data;

      // Overwrite the entire document in Firebase for a more robust update
      await setDoc(doc(db, "gameState", "live"), newGameState);

      alert("CSV data has been imported into the live game state!");
    } catch (error) {
      alert("Error importing data. See console.");
      console.error("Error importing CSV data: ", error);
    }
  };

  const awardPointsR4 = async (winnerId: number) => {
    const docRef = doc(db, "gameState", "live");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const currentGameState = docSnap.data() as GameState;
      const updatedPlayers = currentGameState.players.map(player => 
        player.id === winnerId ? { ...player, score: player.score + 8 } : player
      );

      await updateGameState({
        'round4.winnerId': winnerId,
        players: updatedPlayers
      });
      
      const winner = updatedPlayers.find(p => p.id === winnerId);
      alert(`${winner?.name} wins Round 4 and is awarded +8 points!`);
    } else {
      alert("Error: Game state not found.");
    }
  };

  // NEW function to handle toggling guesses and awarding points automatically
  const handleR1GuessToggle = async (guesserId: number, guess: 'TRUE' | 'LIE') => {
    if (!gameState) return;
    const { players, round1 } = gameState;
    const currentGuess = round1.guesses[guesserId];
    const newGuess = currentGuess === guess ? null : guess; // Toggle off if same button clicked

    const statement = round1.statements.find(s => s.playerId === round1.currentStorytellerId);
    if (!statement) {
      alert("Error: Cannot find the current statement.");
      return;
    }
    
    const wasCorrect = currentGuess === (statement.isTruth ? 'TRUE' : 'LIE');
    const isCorrect = newGuess === (statement.isTruth ? 'TRUE' : 'LIE');

    let scoreChange = 0;
    if (isCorrect && !wasCorrect) scoreChange = 1;
    if (!isCorrect && wasCorrect) scoreChange = -1;

    const updatedPlayers = players.map(p => 
      p.id === guesserId ? { ...p, score: p.score + scoreChange } : p
    );
    
    await updateGameState({
      [`round1.guesses.${guesserId}`]: newGuess,
      players: updatedPlayers,
    });
  };

  // NEW: Saves a guess without scoring
  const handleR1GuessChange = async (guesserId: number, guess: 'TRUE' | 'LIE' | '') => {
    const newGuess = guess === '' ? null : guess;
    await updateGameState({ [`round1.guesses.${guesserId}`]: newGuess });
  };
  
  // MODIFIED: Now handles both revealing and scoring
  const revealAndScoreR1 = async () => {
    if (!gameState) return;
    const { players, round1 } = gameState;
    const statement = round1.statements.find(s => s.playerId === round1.currentStorytellerId);

    if (!statement) {
      alert("Error: Storyteller statement not found.");
      return;
    }
    
    const correctAnswer = statement.isTruth ? 'TRUE' : 'LIE';
    const updatedPlayers = players.map(player => {
      const guess = round1.guesses[player.id];
      if (guess === correctAnswer) {
        return { ...player, score: player.score + 1 };
      }
      return player;
    });

    await updateGameState({ 
      'round1.showResult': true,
      players: updatedPlayers
    });
    alert("Result revealed and scores awarded!");
  };

  const roundOrder = ["LOBBY", "R1", "R2", "R3", "R4", "WINNER"];
  const currentRoundIndex = gameState ? roundOrder.indexOf(gameState.currentRound) : 0;

  if (!gameState) {
    return <div>Loading Game State...</div>;
  }

  return (
    <div className="p-8 font-sans bg-gray-50 min-h-screen">
      <h1 className="text-4xl font-bold mb-8">Operator Control Panel</h1>

      {/* --- Pre-Show Data Upload --- */}
      <fieldset className={sectionClasses}>
        <legend className={h2Classes}>Pre-Show Data Upload</legend>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 items-start">
          <div>
            <label className="font-bold block mb-1">Round 1 Statements CSV</label>
            <input type="file" accept=".csv" onChange={(e) => handleFileParse(e, 'R1')} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
            <a href="/round1_sample.csv" download className="text-sm text-blue-600 hover:underline mt-1 block">Download Round 1 Sample CSV</a>
          </div>
          <div>
            <label className="font-bold block mb-1">Round 3 Sets CSV</label>
            <input type="file" accept=".csv" onChange={(e) => handleFileParse(e, 'R3')} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"/>
            <a href="/round3_sample.csv" download className="text-sm text-violet-600 hover:underline mt-1 block">Download Round 3 Sample CSV</a>
          </div>
        </div>
        <div className="text-center mt-4">
          <button onClick={importCsvData} className={buttonClasses.primary}>Import CSV Data to Game</button>
        </div>
      </fieldset>

      {/* --- Display Controls --- */}
      <fieldset className={sectionClasses}>
        <legend className={h2Classes}>Display Controls</legend>
        <button 
          onClick={() => updateGameState({ showScoreboard: !gameState?.showScoreboard })} 
          className={buttonClasses.secondary}
        >
          Toggle Scoreboard
        </button>
        <button 
          onClick={() => updateGameState({ showLeaderboardModal: true })} 
          className={buttonClasses.secondary}
        >
          Show Full-Screen Scores
        </button>
        <button 
          onClick={() => updateGameState({ showLeaderboardModal: false })} 
          className={buttonClasses.secondary}
        >
          Hide Full-Screen Scores
        </button>
      </fieldset>

      {/* --- General Controls --- */}
      <div className={sectionClasses}>
        <h2 className={h2Classes}>Game Controls</h2>
        <button onClick={initializeGame} className={buttonClasses.secondary}>Reset to Lobby</button>
        {currentRoundIndex < 1 && <button onClick={() => updateGameState({ currentRound: 'R1' })} className={buttonClasses.primary}>Start Round 1</button>}
        {currentRoundIndex < 2 && <button onClick={() => updateGameState({ currentRound: 'R2' })} className={buttonClasses.primary} disabled={currentRoundIndex < 1}>Start Round 2</button>}
        {currentRoundIndex < 3 && <button onClick={() => updateGameState({ currentRound: 'R3' })} className={buttonClasses.primary} disabled={currentRoundIndex < 2}>Start Round 3</button>}
        {currentRoundIndex < 4 && <button onClick={() => updateGameState({ currentRound: 'R4' })} className={buttonClasses.primary} disabled={currentRoundIndex < 3}>Start Round 4</button>}
        {currentRoundIndex < 5 && <button onClick={() => updateGameState({ currentRound: 'WINNER' })} className={buttonClasses.primary} disabled={currentRoundIndex < 4}>Show Winner</button>}
      </div>

      {/* --- Round 1 Controls --- */}
      {currentRoundIndex >= 1 && (
        <fieldset className={sectionClasses} disabled={currentRoundIndex > 1}>
          <legend className={h2Classes}>Round 1: Better Call Bluff</legend>
          
              {/* Storyteller Selection */}
              <div>
                <strong className={strongClasses}>1. Select Storyteller:</strong>
                {initialPlayers.map(p => (
                  <button key={p.id} onClick={() => updateRound1State({ currentStorytellerId: p.id })} className={buttonClasses.secondary}>{p.name}</button>
                ))}
              </div>

              {/* Voting Controls */}
              <div className="my-4">
                <strong className={strongClasses}>2. Control Voting:</strong>
                <button onClick={() => updateRound1State({ votingOpen: true })} className={buttonClasses.secondary} disabled={!gameState.round1.currentStorytellerId}>Open Voting</button>
                <button onClick={() => updateRound1State({ votingOpen: false })} className={buttonClasses.secondary} disabled={!gameState.round1.votingOpen}>Close Voting</button>
              </div>

              {/* Guesser Inputs */}
              <div>
                <strong className={strongClasses}>3. Log Guesses:</strong>
                <div className="my-2 grid grid-cols-3 gap-4">
                  {initialPlayers.filter(p => p.id !== gameState.round1.currentStorytellerId).map(guesser => (
                    <div key={guesser.id} className="flex items-center gap-2">
                      <span className="font-semibold">{guesser.name}:</span>
                      <select 
                        onChange={(e) => handleR1GuessChange(guesser.id, e.target.value as any)}
                        value={gameState.round1.guesses?.[guesser.id] ?? ''}
                        className="p-2 border rounded"
                        disabled={!gameState.round1.votingOpen}
                      >
                        <option value="">-- Select --</option>
                        <option value="TRUE">Truth</option>
                        <option value="LIE">Lie</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reveal Control */}
              <div className="mt-6">
                <strong className={strongClasses}>4. Reveal & Score:</strong>
                <button onClick={revealAndScoreR1} className={buttonClasses.primary} disabled={gameState.round1.votingOpen}>Reveal Truth/Lie</button>
              </div>
        </fieldset>
      )}

      {/* --- Round 2 Controls --- */}
      {currentRoundIndex >= 2 && (
        <fieldset className={sectionClasses} disabled={currentRoundIndex > 2}>
          <legend className={h2Classes}>Round 2: Phone Out, Cash In</legend>
          <div className="grid grid-cols-2 gap-4">
            {initialPlayers.map(p => (
              <div key={p.id}>
                <label className="font-bold">{p.name}'s Guess (₹):</label>
                <input 
                  type="number"
                  className="w-full p-2 border rounded mt-1"
                  value={r2Guesses[p.id] ?? ''}
                  onChange={(e) => setR2Guesses(prev => ({ ...prev, [p.id]: e.target.value }))}
                  onBlur={(e) => handleR2GuessChange(p.id, e.target.value)}
                />
              </div>
            ))}
            <div>
              <label className="font-bold">Actual Resale Value (₹):</label>
              <input 
                type="number" 
                className="w-full p-2 border rounded mt-1"
                value={r2ActualValue}
                onChange={(e) => setR2ActualValue(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            <button onClick={revealR2ActualValue} className={buttonClasses.secondary}>Reveal Actual Value</button>
            <button onClick={revealR2Winner} className={buttonClasses.secondary}>Reveal Winner & Award +4</button>
          </div>
        </fieldset>
      )}

      {/* --- Round 3 Controls --- */}
      {currentRoundIndex >= 3 && (
        <fieldset className={sectionClasses} disabled={currentRoundIndex > 3}>
          <legend className={h2Classes}>Round 3: Catch Me If You Can</legend>
          <div>
            <strong className={strongClasses}>Storyteller:</strong>
            {initialPlayers.map(p => (
              <button key={p.id} onClick={() => updateGameState({ 'round3.currentStorytellerId': p.id })} className={buttonClasses.secondary}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="my-4">
            <button onClick={() => updateGameState({ 'round3.votingOpen': true, 'round3.showResult': false })} className={buttonClasses.secondary}>Open Voting</button>
            <button onClick={() => updateGameState({ 'round3.votingOpen': false })} className={buttonClasses.secondary}>Close Voting</button>
            <button onClick={() => updateGameState({ 'round3.showResult': true })} className={buttonClasses.secondary}>Reveal True Statement</button>
          </div>
          <div>
            <strong className={strongClasses}>Correct Guessers:</strong>
            <div className="my-2">
              {initialPlayers.map(p => (
                <label key={p.id} className="mr-4 inline-flex items-center">
                  <input type="checkbox" onChange={(e) => setR3CorrectGuessers(prev => ({ ...prev, [p.id]: e.target.checked }))} checked={!!r3CorrectGuessers[p.id]} className="form-checkbox h-5 w-5" />
                  <span className="ml-2">{p.name}</span>
                </label>
              ))}
            </div>
            <button onClick={awardPointsR3} className={buttonClasses.secondary}>Award +3 Points</button>
          </div>
        </fieldset>
      )}

      {/* --- Round 4 Controls --- */}
      {currentRoundIndex >= 4 && (
        <fieldset className={sectionClasses} disabled={currentRoundIndex > 4}>
          <legend className={h2Classes}>Round 4: Faking Bad</legend>
          <div>
            <strong className={strongClasses}>Round Winner:</strong>
            {initialPlayers.map(p => (
              <button key={p.id} onClick={() => awardPointsR4(p.id)} className={buttonClasses.primary}>
                Award {p.name} +8 Points
              </button>
            ))}
          </div>
          <div className="mt-4">
            <button onClick={() => updateGameState({ 'round4.showRealOwner': true })} className={buttonClasses.secondary}>
              Reveal Real Owner
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}

// --- Reusable Tailwind classes ---
const sectionClasses = "border border-gray-300 rounded-lg p-6 mt-8 bg-white shadow disabled:bg-gray-100 disabled:opacity-70";
const h2Classes = "text-2xl font-semibold mb-4";
const strongClasses = "font-bold mr-4";
const buttonClasses = {
  primary: "px-6 py-3 text-base font-semibold cursor-pointer m-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed",
  secondary: "px-6 py-3 text-base font-semibold cursor-pointer m-2 rounded-lg bg-gray-500 text-white hover:bg-gray-600 transition-colors disabled:bg-gray-300",
};
