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
  roundStarted: boolean; // Whether the current round has been started (shows intro vs actual content)
  round1: {
    statements: Round1Statement[];
    currentStorytellerId: number | null;
    guesses: { [key: number]: 'TRUE' | 'LIE' | '' }; // New field
    votingOpen: boolean;
    showResult: boolean;
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
  roundStarted: false,
  round1: {
    statements: [], // Now starts empty
    currentStorytellerId: null, // Changed from 1 to null
    guesses: { 1: '', 2: '', 3: '', 4: '' }, // New field
    votingOpen: false,
    showResult: false,
  },
  round2: {
    statements: [], // Empty array for statements
    revealedStatements: [false, false, false, false, false], // All statements hidden initially
    revealOrder: [], // Empty array for reveal order
    part: 'STATEMENTS', // Start with statements part
    guesses: { 1: null, 2: null, 3: null, 4: null },
    actualValue: null,
    winnerId: null,
  },
  round3: {
    sets: [], // Now starts empty
    currentStorytellerId: null,
    currentStatements: [],
    trueIndex: 0,
    nonPlayerGuesses: { 1: null, 2: null, 3: null, 4: null },
    votingOpen: false,
    showResult: false,
    completedStorytellers: [],
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
  const [round2Data, setRound2Data] = useState<string[]>([]); // For Round 2 statements
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

  const updateRound2State = async (newRound2State: object) => {
    try {
      const docRef = doc(db, "gameState", "live");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const currentGameState = docSnap.data() as GameState;
        const updatedRound2State = { ...currentGameState.round2, ...newRound2State };
        await updateDoc(docRef, { round2: updatedRound2State });
      }
    } catch (e) {
      console.error("Error updating Round 2 state: ", e);
      alert("Error updating Round 2 state");
    }
  };

  const updateRound3State = async (newRound3State: object) => {
    try {
      const docRef = doc(db, "gameState", "live");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const currentGameState = docSnap.data() as GameState;
        const updatedRound3State = { ...currentGameState.round3, ...newRound3State };
        await updateDoc(docRef, { round3: updatedRound3State });
      }
    } catch (e) {
      console.error("Error updating Round 3 state: ", e);
      alert("Error updating Round 3 state");
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

  const handleFileParse = (event: ChangeEvent<HTMLInputElement>, round: 'R1' | 'R2' | 'R3') => {
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
          } else if (round === 'R2') {
            const processedData = results.data.map((row: any) => row.statement);
            setRound2Data(processedData);
            alert(`Round 2: ${processedData.length} statements loaded.`);
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
    if (round1Data.length === 0 || round2Data.length === 0 || round3Data.length === 0) {
      alert("Please upload files for Round 1, Round 2, and Round 3 before importing.");
      return;
    }
    try {
      // Create a fresh copy of the initial game state
      const newGameState = { ...initialGameState };
      
      // Overwrite the statement and set arrays with the parsed data
      newGameState.round1.statements = round1Data;
      newGameState.round2.statements = round2Data;
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
    await updateGameState({ [`round1.guesses.${guesserId}`]: guess });
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

  // NEW: Reset everything when selecting a new storyteller
  const selectStorytellerAndReset = async (playerId: number) => {
    await updateRound1State({ 
      currentStorytellerId: playerId,
      votingOpen: false,
      showResult: false,
      guesses: { 1: '', 2: '', 3: '', 4: '' }
    });
  };

  // NEW: Round 2 functions
  const toggleStatementVisibility = async (index: number) => {
    if (!gameState) return;
    const currentRevealedStatements = gameState.round2.revealedStatements || [false, false, false, false, false];
    const currentRevealOrder = gameState.round2.revealOrder || [];
    const newRevealedStatements = [...currentRevealedStatements];
    
    if (newRevealedStatements[index]) {
      // If statement is being hidden, remove from reveal order
      newRevealedStatements[index] = false;
      const newRevealOrder = currentRevealOrder.filter((i: number) => i !== index);
      await updateRound2State({ 
        revealedStatements: newRevealedStatements,
        revealOrder: newRevealOrder
      });
    } else {
      // If statement is being revealed, add to reveal order
      newRevealedStatements[index] = true;
      const newRevealOrder = [...currentRevealOrder, index];
      await updateRound2State({ 
        revealedStatements: newRevealedStatements,
        revealOrder: newRevealOrder
      });
    }
  };

  // NEW: Round 3 functions
  const selectStoryteller = async (playerId: number) => {
    if (!gameState) return;
    
    // Find the storyteller's data from the sets
    const storytellerData = gameState.round3.sets.find(set => set.playerId === playerId);
    if (!storytellerData) return;
    
    // Update round 3 state with selected storyteller
    await updateRound3State({
      currentStorytellerId: playerId,
      currentStatements: storytellerData.statements,
      trueIndex: storytellerData.trueIndex,
      nonPlayerGuesses: { 1: null, 2: null, 3: null, 4: null }, // Reset guesses
      votingOpen: false,
      showResult: false
    });
  };

  const updateNonPlayerGuess = async (playerId: number, guess: number | null) => {
    if (!gameState) return;
    const newGuesses = { ...gameState.round3.nonPlayerGuesses };
    newGuesses[playerId] = guess;
    await updateRound3State({ nonPlayerGuesses: newGuesses });
  };

  const openVoting = async () => {
    if (!gameState) return;
    await updateRound3State({ votingOpen: true });
  };

  const closeVoting = async () => {
    if (!gameState) return;
    await updateRound3State({ votingOpen: false });
  };

  const revealResult = async () => {
    if (!gameState) return;
    
    // Calculate points
    const correctGuessers: number[] = [];
    const nonStorytellerIds = [1, 2, 3, 4].filter(id => id !== gameState.round3.currentStorytellerId);
    const safeNonPlayerGuesses = gameState.round3.nonPlayerGuesses || { 1: null, 2: null, 3: null, 4: null };
    
    nonStorytellerIds.forEach(playerId => {
      if (safeNonPlayerGuesses[playerId] === gameState.round3.trueIndex) {
        correctGuessers.push(playerId);
      }
    });
    
    // Update player scores
    const updatedPlayers = [...gameState.players];
    if (correctGuessers.length > 0) {
      // Non-players who guessed correctly get 3 points each
      correctGuessers.forEach(playerId => {
        const playerIndex = updatedPlayers.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
          updatedPlayers[playerIndex].score += 3;
        }
      });
    } else {
      // If no one guessed correctly, storyteller gets points
      const storytellerIndex = updatedPlayers.findIndex(p => p.id === gameState.round3.currentStorytellerId);
      if (storytellerIndex !== -1) {
        updatedPlayers[storytellerIndex].score += 3;
      }
    }
    
    // Add current storyteller to completed list
    const updatedCompletedStorytellers = [...(gameState.round3.completedStorytellers || []), gameState.round3.currentStorytellerId];
    
    await updateGameState({ 
      players: updatedPlayers,
      round3: { ...gameState.round3, showResult: true, completedStorytellers: updatedCompletedStorytellers }
    });
  };

  const moveToGuessingPart = async () => {
    await updateRound2State({ part: 'GUESSING' });
  };

  // NEW: Start round functions
  const startRound = async (round: 'R1' | 'R2' | 'R3' | 'R4') => {
    await updateGameState({ 
      currentRound: round,
      roundStarted: false // Start with intro screen
    });
  };

  const startRoundContent = async () => {
    await updateGameState({ roundStarted: true });
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
        <div className="grid grid-cols-3 gap-x-8 gap-y-4 items-start">
          <div>
            <label className="font-bold block mb-1">Round 1 Statements CSV</label>
            <input type="file" accept=".csv" onChange={(e) => handleFileParse(e, 'R1')} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
            <a href="/round1_sample.csv" download className="text-sm text-blue-600 hover:underline mt-1 block">Download Round 1 Sample CSV</a>
          </div>
          <div>
            <label className="font-bold block mb-1">Round 2 Statements CSV</label>
            <input type="file" accept=".csv" onChange={(e) => handleFileParse(e, 'R2')} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"/>
            <a href="/round2_sample.csv" download className="text-sm text-green-600 hover:underline mt-1 block">Download Round 2 Sample CSV</a>
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
        {currentRoundIndex < 1 && <button onClick={() => startRound('R1')} className={buttonClasses.primary}>Start Round 1</button>}
        {currentRoundIndex < 2 && <button onClick={() => startRound('R2')} className={buttonClasses.primary} disabled={currentRoundIndex < 1}>Start Round 2</button>}
        {currentRoundIndex < 3 && <button onClick={() => startRound('R3')} className={buttonClasses.primary} disabled={currentRoundIndex < 2}>Start Round 3</button>}
        {currentRoundIndex < 4 && <button onClick={() => startRound('R4')} className={buttonClasses.primary} disabled={currentRoundIndex < 3}>Start Round 4</button>}
        {currentRoundIndex < 5 && <button onClick={() => updateGameState({ currentRound: 'WINNER' })} className={buttonClasses.primary} disabled={currentRoundIndex < 4}>Show Winner</button>}
      </div>

      {/* --- Round 1 Controls --- */}
      {currentRoundIndex >= 1 && (
        <fieldset className={sectionClasses} disabled={currentRoundIndex > 1}>
          <legend className={h2Classes}>Round 1: Better Call Bluff</legend>
          
          {!gameState.roundStarted && (
            <div className="mb-6">
              <button onClick={startRoundContent} className={buttonClasses.primary}>
                Start Round 1 Content
              </button>
            </div>
          )}
          
              {/* Storyteller Selection */}
              <div>
                <strong className={strongClasses}>1. Select Storyteller:</strong>
                {initialPlayers.map(p => (
                  <button key={p.id} onClick={() => selectStorytellerAndReset(p.id)} className={buttonClasses.secondary}>{p.name}</button>
                ))}
              </div>

              {/* Guesser Inputs */}
              <div className="my-4">
                <strong className={strongClasses}>2. Log Guesses:</strong>
                <div className="my-2 grid grid-cols-3 gap-4">
                  {initialPlayers.filter(p => p.id !== gameState.round1.currentStorytellerId).map(guesser => (
                    <div key={guesser.id} className="flex items-center gap-2">
                      <span className="font-semibold">{guesser.name}:</span>
                      <select 
                        onChange={(e) => handleR1GuessChange(guesser.id, e.target.value as any)}
                        value={gameState.round1.guesses?.[guesser.id] ?? ''}
                        className="p-2 border rounded"
                        disabled={gameState.round1.votingOpen}
                      >
                        <option value="">-- Select --</option>
                        <option value="TRUE">True</option>
                        <option value="LIE">False</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voting Controls */}
              <div className="my-4">
                <strong className={strongClasses}>3. Control Voting:</strong>
                <button onClick={() => updateRound1State({ votingOpen: true })} className={buttonClasses.secondary} disabled={!gameState.round1.currentStorytellerId}>Open Voting</button>
                <button onClick={() => updateRound1State({ votingOpen: false })} className={buttonClasses.secondary} disabled={!gameState.round1.votingOpen}>Close Voting</button>
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
          
          {!gameState.roundStarted && (
            <div className="mb-6">
              <button onClick={startRoundContent} className={buttonClasses.primary}>
                Start Round 2 Content
              </button>
            </div>
          )}
          
          {/* Part 1: Statements */}
          {gameState?.round2.part === 'STATEMENTS' && (
            <div>
              <strong className={strongClasses}>Part 1: Display Statements</strong>
              
              {/* Statement List with Switches */}
              <div className="my-4">
                <p className="text-sm text-gray-600 mb-2">Toggle statements to show on audience:</p>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {gameState.round2.statements.map((statement, index) => {
                    const safeRevealedStatements = gameState.round2.revealedStatements || [false, false, false, false, false];
                    return (
                      <div key={index} className="flex items-start gap-3 p-3 border rounded bg-gray-50">
                        <div className="flex items-center">
                          <button
                            onClick={() => toggleStatementVisibility(index)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              safeRevealedStatements[index] ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                safeRevealedStatements[index] ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                                              <div className="flex-1">
                          <span className="text-sm font-semibold text-gray-600">Statement {index + 1}:</span>
                          <p className="text-sm text-gray-800 mt-1">{statement}</p>
                        </div>
                      </div>
                    );
                  })}
                  </div>
              </div>
              
              <div className="mt-6">
                <button onClick={moveToGuessingPart} className={buttonClasses.primary}>
                  Move to Guessing Part
                </button>
              </div>
            </div>
          )}

          {/* Part 2: Guessing */}
          {gameState?.round2.part === 'GUESSING' && (
            <div>
              <strong className={strongClasses}>Part 2: Value Guessing</strong>
              <div className="grid grid-cols-2 gap-4 mt-4">
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
            </div>
          )}
        </fieldset>
      )}

      {/* --- Round 3 Controls --- */}
      {currentRoundIndex >= 3 && (
        <fieldset className={sectionClasses} disabled={currentRoundIndex > 3}>
          <legend className={h2Classes}>Round 3: Catch Me If You Can</legend>
          
          {!gameState.roundStarted && (
            <div className="mb-6">
              <button onClick={startRoundContent} className={buttonClasses.primary}>
                Start Round 3 Content
              </button>
            </div>
          )}

          {gameState.roundStarted && (
            <div>
              {/* Storyteller Selection */}
              {!gameState.round3.currentStorytellerId && (
                <div className="mb-6">
                  <strong className={strongClasses}>Select Storyteller:</strong>
                  <div className="mt-2 space-x-2">
                    {initialPlayers
                      .filter(p => !gameState.round3.completedStorytellers?.includes(p.id))
                      .map(p => (
                        <button 
                          key={p.id} 
                          onClick={() => selectStoryteller(p.id)} 
                          className={buttonClasses.secondary}
                        >
                          {p.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Current Storyteller Display */}
              {gameState.round3.currentStorytellerId && (
                <div className="mb-6">
                  <strong className={strongClasses}>Current Storyteller:</strong>
                  <div className="mt-2 p-3 bg-blue-100 rounded">
                    {initialPlayers.find(p => p.id === gameState.round3.currentStorytellerId)?.name}
                  </div>
                </div>
              )}

              {/* Non-Player Guesses */}
              {gameState.round3.currentStorytellerId && !gameState.round3.votingOpen && !gameState.round3.showResult && (
                <div className="mb-6">
                  <strong className={strongClasses}>Non-Player Guesses:</strong>
                  <div className="mt-2 space-y-3">
                    {initialPlayers
                      .filter(p => p.id !== gameState.round3.currentStorytellerId)
                      .map(p => {
                        const safeNonPlayerGuesses = gameState.round3.nonPlayerGuesses || { 1: null, 2: null, 3: null, 4: null };
                        return (
                          <div key={p.id} className="flex items-center gap-3">
                            <span className="font-semibold w-20">{p.name}:</span>
                            <select 
                              className="p-2 border rounded"
                              value={safeNonPlayerGuesses[p.id] ?? ''}
                              onChange={(e) => updateNonPlayerGuess(p.id, e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">Select...</option>
                              <option value="0">Statement 1</option>
                              <option value="1">Statement 2</option>
                              <option value="2">Statement 3</option>
                            </select>
                          </div>
                        );
                      })}
                  </div>
                  <div className="mt-4">
                    <button onClick={openVoting} className={buttonClasses.primary}>
                      Open Audience Voting
                    </button>
                  </div>
                </div>
              )}

              {/* Voting Controls */}
              {gameState.round3.votingOpen && !gameState.round3.showResult && (
                <div className="mb-6">
                  <strong className={strongClasses}>Audience Voting:</strong>
                  <div className="mt-2 space-x-2">
                    <button onClick={closeVoting} className={buttonClasses.secondary}>
                      Close Voting
                    </button>
                  </div>
                </div>
              )}

              {/* Reveal Controls */}
              {!gameState.round3.votingOpen && !gameState.round3.showResult && gameState.round3.currentStorytellerId && (
                <div className="mb-6">
                  <strong className={strongClasses}>Reveal Result:</strong>
                  <div className="mt-2 space-x-2">
                    <button onClick={revealResult} className={buttonClasses.primary}>
                      Reveal Truth & Award Points
                    </button>
                  </div>
                </div>
              )}

              {/* Result Display */}
              {gameState.round3.showResult && (
                <div className="mb-6">
                  <strong className={strongClasses}>Result:</strong>
                  <div className="mt-2 p-3 bg-green-100 rounded mb-4">
                    Result has been revealed on audience display.
                  </div>
                  <div className="mt-4">
                    <strong className={strongClasses}>Select Next Storyteller:</strong>
                    <div className="mt-2 space-x-2">
                      {initialPlayers
                        .filter(p => !gameState.round3.completedStorytellers?.includes(p.id))
                        .map(p => (
                          <button 
                            key={p.id} 
                            onClick={() => selectStoryteller(p.id)} 
                            className={buttonClasses.secondary}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </fieldset>
      )}

      {/* --- Round 4 Controls --- */}
      {currentRoundIndex >= 4 && (
        <fieldset className={sectionClasses} disabled={currentRoundIndex > 4}>
          <legend className={h2Classes}>Round 4: Faking Bad</legend>
          
          {!gameState.roundStarted && (
            <div className="mb-6">
              <button onClick={startRoundContent} className={buttonClasses.primary}>
                Start Round 4 Content
              </button>
            </div>
          )}
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
