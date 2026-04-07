'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types (minimal slice needed for audience page) ─────────────────────────

interface Player {
  id: number;
  name: string;
  score: number;
  photo: string;
}

interface WarmupStatement {
  statement: string;
  isLie: boolean;
}

interface Segment1Statement {
  playerId: number;
  playerName: string;
  statement: string;
  isLie: boolean;
}

interface Segment2Statement {
  playerId: number;
  playerName: string;
  statement1: string;
  statement2: string;
  lieIndex: 1 | 2;
}

interface GameState {
  phase: 'SETUP' | 'WARMUP' | 'SEGMENT1' | 'SEGMENT2' | 'SEGMENT3' | 'FINAL';
  players: Player[];
  warmup: {
    statements: WarmupStatement[];
    currentIndex: number;
    audienceVotingOpen: boolean;
    showResult: boolean;
  };
  segment1: {
    statements: Segment1Statement[];
    currentStorytellerId: number | null;
    audienceVotingOpen: boolean;
    showResult: boolean;
  };
  segment2: {
    statements: Segment2Statement[];
    currentStorytellerId: number | null;
    audienceVotingOpen: boolean;
    showResult: boolean;
  };
  segment3: {
    photoUrl: string | null;
    photoTitle: string | null;
    audienceVotingOpen: boolean;
    showResult: boolean;
    winnerId: number | null;
  };
  audienceVotes: {
    [deviceId: string]: {
      choice: string;
      votingRound: string;
    };
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getOrCreateDeviceId(): string {
  const key = 'lh_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function getCurrentVotingRound(gs: GameState): string | null {
  if (gs.warmup?.audienceVotingOpen) {
    return `warmup-${gs.warmup.currentIndex}`;
  }
  if (gs.segment1?.audienceVotingOpen && gs.segment1.currentStorytellerId != null) {
    return `seg1-${gs.segment1.currentStorytellerId}`;
  }
  if (gs.segment2?.audienceVotingOpen && gs.segment2.currentStorytellerId != null) {
    return `seg2-${gs.segment2.currentStorytellerId}`;
  }
  if (gs.segment3?.audienceVotingOpen) {
    return 'seg3';
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AudiencePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Initialise device ID on client
  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  // Firestore listener
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'gameState', 'live'), (snap) => {
      if (snap.exists()) {
        setGameState(snap.data() as GameState);
      }
    });
    return () => unsubscribe();
  }, []);

  // ── Vote submission ──────────────────────────────────────────────────────

  async function vote(choice: string) {
    if (!deviceId || !gameState) return;
    const votingRound = getCurrentVotingRound(gameState);
    if (!votingRound) return;

    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'gameState', 'live'), {
        [`audienceVotes.${deviceId}`]: { choice, votingRound },
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const currentVotingRound = gameState ? getCurrentVotingRound(gameState) : null;
  const myVote =
    deviceId && gameState?.audienceVotes?.[deviceId]
      ? gameState.audienceVotes[deviceId]
      : null;
  const alreadyVoted =
    myVote !== null && myVote?.votingRound === currentVotingRound;

  // ── Render helpers ───────────────────────────────────────────────────────

  const btnBase =
    'w-full rounded-2xl py-8 text-2xl font-bold mb-4 transition-opacity disabled:opacity-50';

  function ConfirmationMessage({ choice }: { choice: string }) {
    let colorClass = 'text-orange-400';
    if (choice === 'TRUTH') colorClass = 'text-green-400';
    if (choice === 'LIE') colorClass = 'text-red-400';

    const label =
      choice === 'TRUTH'
        ? 'TRUTH'
        : choice === 'LIE'
        ? 'LIE'
        : choice === 'STATEMENT1'
        ? 'Statement 1 is the Lie'
        : choice === 'STATEMENT2'
        ? 'Statement 2 is the Lie'
        : `Player ${choice}`;

    return (
      <div className="flex flex-col items-center gap-6 px-6">
        <p className={`text-3xl font-bold text-center ${colorClass}`}>
          You voted: {label}
        </p>
        <button
          onClick={() => {
            // Clearing local "already voted" state so buttons reappear
            // We do this by setting a sentinel — user taps Change Vote,
            // which means we just re-show the buttons (myVote stays in
            // Firestore but UI shows buttons again via local flag).
            setShowChange(true);
          }}
          className="text-gray-400 underline text-base"
        >
          Change vote
        </button>
      </div>
    );
  }

  // Local flag: user pressed "Change vote"
  const [showChange, setShowChange] = useState(false);

  // Reset showChange whenever votingRound changes (new question)
  const [lastVotingRound, setLastVotingRound] = useState<string | null>(null);
  useEffect(() => {
    if (currentVotingRound !== lastVotingRound) {
      setLastVotingRound(currentVotingRound);
      setShowChange(false);
    }
  }, [currentVotingRound, lastVotingRound]);

  const showButtons = !alreadyVoted || showChange;

  // ── Screens ──────────────────────────────────────────────────────────────

  // Loading
  if (!gameState) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-lg">Connecting...</p>
      </div>
    );
  }

  const { warmup, segment1, segment2, segment3, players } = gameState;

  // CASE 2 — Warmup voting open
  if (warmup?.audienceVotingOpen) {
    const stmt = warmup.statements?.[warmup.currentIndex];
    return (
      <div className="bg-black min-h-screen flex flex-col px-4 py-10">
        <p className="text-gray-400 text-sm text-center mb-4 uppercase tracking-widest">
          Warmup Round
        </p>
        {stmt && (
          <p className="text-white text-xl text-center px-6 mb-8">
            {stmt.statement}
          </p>
        )}
        {showButtons ? (
          <>
            <button
              className={`${btnBase} bg-green-500 text-white`}
              disabled={submitting}
              onClick={() => { setShowChange(false); vote('TRUTH'); }}
            >
              ✓ TRUTH
            </button>
            <button
              className={`${btnBase} bg-red-500 text-white`}
              disabled={submitting}
              onClick={() => { setShowChange(false); vote('LIE'); }}
            >
              ✗ LIE
            </button>
          </>
        ) : (
          <ConfirmationMessage choice={myVote!.choice} />
        )}
      </div>
    );
  }

  // CASE 3 — Segment 1 voting open
  if (segment1?.audienceVotingOpen && segment1.currentStorytellerId != null) {
    const stmtObj = segment1.statements?.find(
      (s) => s.playerId === segment1.currentStorytellerId
    );
    return (
      <div className="bg-black min-h-screen flex flex-col px-4 py-10">
        <p className="text-gray-400 text-sm text-center mb-2 uppercase tracking-widest">
          Segment 1
        </p>
        {stmtObj && (
          <>
            <p className="text-orange-400 text-2xl font-bold text-center mb-4">
              {stmtObj.playerName}
            </p>
            <p className="text-white text-xl text-center px-6 mb-8">
              {stmtObj.statement}
            </p>
          </>
        )}
        {showButtons ? (
          <>
            <button
              className={`${btnBase} bg-green-500 text-white`}
              disabled={submitting}
              onClick={() => { setShowChange(false); vote('TRUTH'); }}
            >
              TRUTH
            </button>
            <button
              className={`${btnBase} bg-red-500 text-white`}
              disabled={submitting}
              onClick={() => { setShowChange(false); vote('LIE'); }}
            >
              LIE
            </button>
          </>
        ) : (
          <ConfirmationMessage choice={myVote!.choice} />
        )}
      </div>
    );
  }

  // CASE 4 — Segment 2 voting open
  if (segment2?.audienceVotingOpen && segment2.currentStorytellerId != null) {
    const stmtObj = segment2.statements?.find(
      (s) => s.playerId === segment2.currentStorytellerId
    );
    return (
      <div className="bg-black min-h-screen flex flex-col px-4 py-10">
        <p className="text-gray-400 text-sm text-center mb-2 uppercase tracking-widest">
          Segment 2
        </p>
        {stmtObj && (
          <>
            <p className="text-orange-400 text-2xl font-bold text-center mb-4">
              {stmtObj.playerName}
            </p>
            <div className="flex flex-col gap-4 mb-8 px-2">
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">
                  Statement 1
                </p>
                <p className="text-white text-lg">{stmtObj.statement1}</p>
              </div>
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">
                  Statement 2
                </p>
                <p className="text-white text-lg">{stmtObj.statement2}</p>
              </div>
            </div>
          </>
        )}
        {showButtons ? (
          <>
            <button
              className={`${btnBase} bg-orange-500 text-white`}
              disabled={submitting}
              onClick={() => { setShowChange(false); vote('STATEMENT1'); }}
            >
              Statement 1 is the Lie
            </button>
            <button
              className={`${btnBase} bg-purple-600 text-white`}
              disabled={submitting}
              onClick={() => { setShowChange(false); vote('STATEMENT2'); }}
            >
              Statement 2 is the Lie
            </button>
          </>
        ) : (
          <ConfirmationMessage choice={myVote!.choice} />
        )}
      </div>
    );
  }

  // CASE 5 — Segment 3 voting open
  if (segment3?.audienceVotingOpen) {
    return (
      <div className="bg-black min-h-screen flex flex-col px-4 py-10">
        <p className="text-gray-400 text-sm text-center mb-2 uppercase tracking-widest">
          Segment 3
        </p>
        <p className="text-white text-xl text-center px-6 mb-8">
          Who does this belong to?
        </p>
        {showButtons ? (
          <>
            {players.map((player) => {
              const isSelected = myVote?.choice === String(player.id) && showChange;
              return (
                <button
                  key={player.id}
                  className={`${btnBase} ${
                    isSelected ? 'bg-orange-500' : 'bg-gray-700'
                  } text-white`}
                  disabled={submitting}
                  onClick={() => { setShowChange(false); vote(String(player.id)); }}
                >
                  {player.name}
                </button>
              );
            })}
          </>
        ) : (
          <ConfirmationMessage choice={myVote!.choice} />
        )}
      </div>
    );
  }

  // CASE 1 — Voting closed (default)
  return (
    <div className="bg-black min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-orange-500 text-4xl font-bold tracking-tight">
        LIAR HEARTS
      </h1>
      <p className="text-white text-2xl font-semibold mt-4">Voting is closed</p>
      <p className="text-gray-500 text-base">Stay tuned...</p>
    </div>
  );
}
