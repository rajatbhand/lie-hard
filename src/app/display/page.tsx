'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ──────────────────────────────────────────────────────────────────

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
  showScoreboard: boolean;
  showLeaderboardModal: boolean;
  banterTimer: {
    totalSeconds: number;
    startedAt: number | null;
    running: boolean;
  };
  warmup: {
    statements: WarmupStatement[];
    currentIndex: number;
    audienceVotingOpen: boolean;
    showResult: boolean;
  };

  segment1: {
    statements: Segment1Statement[];
    currentStorytellerId: number | null;
    playerVotes: { [playerId: number]: 'TRUTH' | 'LIE' | null };
    audienceVotingOpen: boolean;
    showResult: boolean;
    completedStorytellers: number[];
  };

  segment2: {
    statements: Segment2Statement[];
    currentStorytellerId: number | null;
    playerVotes: { [playerId: number]: 'STATEMENT1' | 'STATEMENT2' | null };
    audienceVotingOpen: boolean;
    showResult: boolean;
    completedStorytellers: number[];
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

// ── Vote count helper ──────────────────────────────────────────────────────

function getVoteCounts(
  audienceVotes: GameState['audienceVotes'],
  votingRound: string,
  options: string[]
): Record<string, number> {
  const counts = Object.fromEntries(options.map((o) => [o, 0]));
  Object.values(audienceVotes ?? {}).forEach((v) => {
    if (v.votingRound === votingRound && counts[v.choice] !== undefined) {
      counts[v.choice]++;
    }
  });
  return counts;
}

// ── Broadcast vote bars ────────────────────────────────────────────────────

function VoteBars({
  counts,
  labels,
}: {
  counts: Record<string, number>;
  labels?: Record<string, string>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const colors: Record<string, string> = {
    TRUTH: 'bg-green-500',
    LIE: 'bg-red-500',
    STATEMENT1: 'bg-orange-500',
    STATEMENT2: 'bg-purple-500',
  };

  return (
    <div className="w-full space-y-6">
      {Object.entries(counts).map(([key, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const label = labels?.[key] ?? key;
        return (
          <div key={key}>
            <div className="flex justify-between mb-2">
              <span className="text-white text-3xl font-bold">{label}</span>
              <span className="text-white text-3xl font-bold">{pct}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-10 overflow-hidden">
              <div
                className={`${colors[key] ?? 'bg-gray-500'} h-10 rounded-full transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-gray-500 text-xl text-right">Total votes: {total}</p>
    </div>
  );
}

// ── Statement card ─────────────────────────────────────────────────────────

function StatementCard({
  text,
  label,
  highlight,
}: {
  text: string;
  label?: string;
  highlight?: 'truth' | 'lie' | null;
}) {
  const borderColor =
    highlight === 'truth'
      ? 'border-green-500'
      : highlight === 'lie'
      ? 'border-red-500'
      : 'border-orange-500';
  const bgColor =
    highlight === 'truth'
      ? 'bg-green-900/40'
      : highlight === 'lie'
      ? 'bg-red-900/40'
      : 'bg-gray-900';

  return (
    <div className={`rounded-2xl border-2 ${borderColor} ${bgColor} px-16 py-10 w-full`}>
      {label && (
        <p
          className={`text-xl font-bold uppercase tracking-widest mb-4 ${
            highlight === 'truth'
              ? 'text-green-400'
              : highlight === 'lie'
              ? 'text-red-400'
              : 'text-orange-400'
          }`}
        >
          {label}
        </p>
      )}
      <p className="text-white text-5xl font-semibold leading-snug">{text}</p>
    </div>
  );
}

// ── Player avatar (circular) ───────────────────────────────────────────────

function PlayerAvatar({
  player,
  size = 160,
  glow = false,
}: {
  player: Player;
  size?: number;
  glow?: boolean;
}) {
  return (
    <img
      src={player.photo}
      alt={player.name}
      className={`rounded-full object-cover border-4 border-orange-500 ${
        glow ? 'shadow-[0_0_60px_20px_rgba(249,115,22,0.6)]' : ''
      }`}
      style={{ width: size, height: size }}
    />
  );
}

// ── Scoreboard sidebar ─────────────────────────────────────────────────────

function Scoreboard({
  players,
  highlightedIds,
}: {
  players: Player[];
  highlightedIds: Set<number>;
}) {
  return (
    <aside
      className="flex flex-col h-full shrink-0"
      style={{ width: 280, borderLeft: '1px solid #333', backgroundColor: '#111827' }}
    >
      <div className="px-6 py-6 border-b border-gray-800">
        <p className="text-orange-400 text-2xl font-bold text-center tracking-wide">Kiwi Points</p>
      </div>
      <div className="flex flex-col gap-4 px-6 py-6 flex-1">
        {players.map((player) => {
          const isHighlighted = highlightedIds.has(player.id);
          return (
            <div
              key={player.id}
              className={`flex items-center gap-4 rounded-xl p-3 transition-colors duration-300 ${
                isHighlighted ? 'bg-orange-500/20' : ''
              }`}
            >
              <img
                src={player.photo}
                alt={player.name}
                className="rounded-full object-cover border-2 border-gray-600 shrink-0"
                style={{ width: 64, height: 64 }}
              />
              <div className="min-w-0">
                <p className="text-white font-semibold text-lg truncate">{player.name}</p>
                <p
                  className={`text-2xl font-bold transition-colors duration-300 ${
                    isHighlighted ? 'text-orange-400' : 'text-gray-300'
                  }`}
                >
                  {player.score}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ── Leaderboard modal ──────────────────────────────────────────────────────

function LeaderboardModal({ players }: { players: Player[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
      {/* Confetti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(60)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-fall"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
              width: 12,
              height: 12,
              backgroundColor: ['#F97316', '#EAB308', '#22C55E', '#3B82F6', '#EC4899'][
                Math.floor(Math.random() * 5)
              ],
              borderRadius: Math.random() > 0.5 ? '50%' : '0',
            }}
          />
        ))}
      </div>

      <h1 className="text-8xl font-bold text-orange-500 mb-16 tracking-tight">LIAR HEARTS</h1>
      <div className="flex gap-16 items-end">
        {sorted.map((player, rank) => (
          <div key={player.id} className="flex flex-col items-center gap-4">
            <p className="text-gray-500 text-2xl font-bold">#{rank + 1}</p>
            <img
              src={player.photo}
              alt={player.name}
              className={`rounded-full object-cover border-4 ${
                rank === 0 ? 'border-yellow-400' : 'border-gray-600'
              }`}
              style={{ width: rank === 0 ? 180 : 140, height: rank === 0 ? 180 : 140 }}
            />
            <p className={`font-bold ${rank === 0 ? 'text-5xl text-white' : 'text-4xl text-gray-300'}`}>
              {player.name}
            </p>
            <p className={`font-bold ${rank === 0 ? 'text-4xl text-orange-400' : 'text-3xl text-gray-400'}`}>
              {player.score} pts
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Phase screens ──────────────────────────────────────────────────────────

function SetupScreen() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black">
      <h1 className="text-[120px] font-black text-orange-500 leading-none tracking-tight">
        LIAR HEARTS
      </h1>
      <p className="text-5xl text-gray-400 mt-4 font-semibold">Season 2</p>
      <p className="text-2xl text-gray-600 mt-8">Setting up...</p>
    </div>
  );
}

function WarmupScreen({ gameState }: { gameState: GameState }) {
  const { warmup } = gameState;
  const stmt = warmup.statements[warmup.currentIndex];
  const counts = getVoteCounts(
    gameState.audienceVotes,
    `warmup-${warmup.currentIndex}`,
    ['TRUTH', 'LIE']
  );

  if (warmup.showResult && stmt) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center transition-colors duration-500 ${
          stmt.isLie ? 'bg-red-900' : 'bg-green-900'
        }`}
      >
        <p className="text-gray-300 text-3xl uppercase tracking-widest mb-6">Warmup Round</p>
        <p
          className={`text-[200px] font-black leading-none ${
            stmt.isLie ? 'text-red-300' : 'text-green-300'
          }`}
        >
          {stmt.isLie ? 'LIE' : 'TRUTH'}
        </p>
        <div className="w-[900px] mt-12">
          <VoteBars counts={counts} />
        </div>
      </div>
    );
  }

  if (warmup.audienceVotingOpen && stmt) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black px-24 gap-12">
        <p className="text-gray-500 text-2xl uppercase tracking-widest">Warmup Round</p>
        <div className="w-full max-w-4xl">
          <StatementCard text={stmt.statement} />
        </div>
        <div className="w-[900px]">
          <VoteBars counts={counts} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black px-24 gap-8">
      <p className="text-gray-500 text-2xl uppercase tracking-widest">Warmup Round</p>
      {stmt && (
        <div className="w-full max-w-4xl">
          <StatementCard text={stmt.statement} />
        </div>
      )}
    </div>
  );
}

function Segment1Screen({ gameState }: { gameState: GameState }) {
  const { segment1, players } = gameState;
  const storyteller = players.find((p) => p.id === segment1.currentStorytellerId);
  const stmtObj = segment1.statements.find((s) => s.playerId === segment1.currentStorytellerId);
  const counts = getVoteCounts(
    gameState.audienceVotes,
    `seg1-${segment1.currentStorytellerId}`,
    ['TRUTH', 'LIE']
  );

  if (!storyteller || !stmtObj) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-8">
        <p className="text-orange-400 text-4xl font-bold uppercase tracking-widest">Segment 1</p>
        <p className="text-gray-500 text-3xl">Waiting for next player...</p>
      </div>
    );
  }

  if (segment1.showResult) {
    const isLie = stmtObj.isLie;
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center transition-colors duration-500 ${
          isLie ? 'bg-red-950' : 'bg-green-950'
        } gap-8`}
      >
        <div className="flex items-center gap-6">
          <PlayerAvatar player={storyteller} size={120} />
          <p className="text-white text-5xl font-bold">{storyteller.name}</p>
        </div>
        <p
          className={`text-[180px] font-black leading-none ${
            isLie ? 'text-red-400' : 'text-green-400'
          }`}
        >
          {isLie ? 'LIE' : 'TRUTH'}
        </p>
        <div className="w-[800px]">
          <VoteBars counts={counts} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-black">
      {/* Top 30% — player */}
      <div className="flex items-center justify-center gap-8 px-20" style={{ height: '30%' }}>
        <PlayerAvatar player={storyteller} size={160} />
        <div>
          <p className="text-white text-7xl font-black">{storyteller.name}</p>
          <p className="text-gray-500 text-3xl mt-2">makes a statement</p>
        </div>
      </div>

      {/* Middle 40% — statement */}
      <div className="flex items-center justify-center px-20" style={{ height: '40%' }}>
        <StatementCard text={stmtObj.statement} />
      </div>

      {/* Bottom 30% — vote bars or label */}
      <div className="flex items-center justify-center px-24" style={{ height: '30%' }}>
        {segment1.audienceVotingOpen ? (
          <div className="w-full max-w-3xl">
            <VoteBars counts={counts} />
          </div>
        ) : (
          <p className="text-gray-800 text-2xl uppercase tracking-widest">Segment 1</p>
        )}
      </div>
    </div>
  );
}

function Segment2Screen({ gameState }: { gameState: GameState }) {
  const { segment2, players } = gameState;
  const storyteller = players.find((p) => p.id === segment2.currentStorytellerId);
  const stmtObj = segment2.statements.find((s) => s.playerId === segment2.currentStorytellerId);
  const counts = getVoteCounts(
    gameState.audienceVotes,
    `seg2-${segment2.currentStorytellerId}`,
    ['STATEMENT1', 'STATEMENT2']
  );
  const labels = { STATEMENT1: 'Stmt 1 is Lie', STATEMENT2: 'Stmt 2 is Lie' };

  if (!storyteller || !stmtObj) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-8">
        <p className="text-orange-400 text-4xl font-bold uppercase tracking-widest">Segment 2</p>
        <p className="text-gray-500 text-3xl">Waiting for next player...</p>
      </div>
    );
  }

  if (segment2.showResult) {
    const lieIsStmt1 = stmtObj.lieIndex === 1;
    return (
      <div className="w-full h-full flex flex-col bg-black">
        <div className="flex items-center justify-center gap-6 px-20" style={{ height: '25%' }}>
          <PlayerAvatar player={storyteller} size={120} />
          <p className="text-white text-5xl font-bold">{storyteller.name}</p>
        </div>
        <div className="flex gap-8 px-20 flex-1 items-center">
          <StatementCard
            text={stmtObj.statement1}
            label="Statement 1"
            highlight={lieIsStmt1 ? 'lie' : 'truth'}
          />
          <StatementCard
            text={stmtObj.statement2}
            label="Statement 2"
            highlight={lieIsStmt1 ? 'truth' : 'lie'}
          />
        </div>
        <div className="flex items-center justify-center px-24" style={{ height: '30%' }}>
          <div className="w-full max-w-3xl">
            <VoteBars counts={counts} labels={labels} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-black">
      {/* Player */}
      <div className="flex items-center justify-center gap-8 px-20" style={{ height: '25%' }}>
        <PlayerAvatar player={storyteller} size={140} />
        <div>
          <p className="text-white text-6xl font-black">{storyteller.name}</p>
          <p className="text-gray-500 text-2xl mt-2">makes two statements</p>
        </div>
      </div>

      {/* Two statement cards */}
      <div className="flex gap-8 px-20 flex-1 items-center">
        <StatementCard text={stmtObj.statement1} label="Statement 1" />
        <StatementCard text={stmtObj.statement2} label="Statement 2" />
      </div>

      {/* Vote bars or label */}
      <div className="flex items-center justify-center px-24" style={{ height: '28%' }}>
        {segment2.audienceVotingOpen ? (
          <div className="w-full max-w-3xl">
            <VoteBars counts={counts} labels={labels} />
          </div>
        ) : (
          <p className="text-gray-800 text-2xl uppercase tracking-widest">Segment 2</p>
        )}
      </div>
    </div>
  );
}

function Segment3Screen({ gameState }: { gameState: GameState }) {
  const { segment3, players } = gameState;
  const winner = players.find((p) => p.id === segment3.winnerId);

  // Count-up animation for Kiwi Points
  const [kpDisplay, setKpDisplay] = useState(0);
  useEffect(() => {
    if (!segment3.showResult) { setKpDisplay(0); return; }
    let current = 0;
    const step = 10;
    const interval = setInterval(() => {
      current += step;
      if (current >= 300) { setKpDisplay(300); clearInterval(interval); }
      else setKpDisplay(current);
    }, 25);
    return () => clearInterval(interval);
  }, [segment3.showResult, segment3.winnerId]);

  // Per-player audience vote counts
  const playerCounts: Record<number, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  Object.values(gameState.audienceVotes ?? {}).forEach((v) => {
    if (v.votingRound === 'seg3') {
      const id = parseInt(v.choice, 10);
      if (playerCounts[id] !== undefined) playerCounts[id]++;
    }
  });
  const totalVotes = Object.values(playerCounts).reduce((a, b) => a + b, 0);

  if (segment3.showResult && winner) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-10">
        <PlayerAvatar player={winner} size={260} glow />
        <p className="text-white text-8xl font-black">{winner.name}</p>
        <p className="text-orange-400 text-6xl font-black">+{kpDisplay} KIWI POINTS</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex bg-black">
      {/* Left 50% — object photo */}
      <div className="w-1/2 h-full relative">
        {segment3.photoUrl ? (
          <img
            src={segment3.photoUrl}
            alt={segment3.photoTitle ?? ''}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-900 flex items-center justify-center">
            <p className="text-gray-600 text-3xl">No photo</p>
          </div>
        )}
        {segment3.photoTitle && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-10 py-6">
            <p className="text-white text-3xl font-semibold">{segment3.photoTitle}</p>
          </div>
        )}
      </div>

      {/* Right 50% — vote bars */}
      <div className="w-1/2 h-full flex flex-col justify-center px-16 gap-10">
        <p className="text-white text-4xl font-bold">Who does this belong to?</p>
        <div className="space-y-8">
          {players.map((player) => {
            const count = playerCounts[player.id] ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            return (
              <div key={player.id} className="flex items-center gap-5">
                <img
                  src={player.photo}
                  alt={player.name}
                  className="rounded-full object-cover border-2 border-gray-600 shrink-0"
                  style={{ width: 64, height: 64 }}
                />
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-white text-2xl font-semibold">{player.name}</span>
                    <span className="text-gray-400 text-xl">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-8 overflow-hidden">
                    <div
                      className="bg-orange-500 h-8 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-gray-600 text-xl">Total votes: {totalVotes}</p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DisplayPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const prevScoresRef = useRef<Record<number, number>>({});
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const [timerDisplay, setTimerDisplay] = useState(0);
  const timerTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute remaining timer seconds from Firestore banterTimer
  useEffect(() => {
    const bt = gameState?.banterTimer;
    if (timerTickRef.current) clearInterval(timerTickRef.current);
    if (!bt) return;
    if (bt.running && bt.startedAt !== null) {
      const tick = () => {
        const remaining = Math.max(0, bt.totalSeconds - Math.floor((Date.now() - bt.startedAt!) / 1000));
        setTimerDisplay(remaining);
      };
      tick();
      timerTickRef.current = setInterval(tick, 250);
    } else {
      setTimerDisplay(bt.totalSeconds);
    }
    return () => { if (timerTickRef.current) clearInterval(timerTickRef.current); };
  }, [gameState?.banterTimer?.running, gameState?.banterTimer?.startedAt, gameState?.banterTimer?.totalSeconds]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'gameState', 'live'), (snap) => {
      if (!snap.exists()) return;
      const newState = snap.data() as GameState;

      // Detect score changes for highlight animation
      const changed = new Set<number>();
      newState.players.forEach((p) => {
        if (
          prevScoresRef.current[p.id] !== undefined &&
          prevScoresRef.current[p.id] !== p.score
        ) {
          changed.add(p.id);
        }
        prevScoresRef.current[p.id] = p.score;
      });
      if (changed.size > 0) {
        setHighlightedIds(changed);
        setTimeout(() => setHighlightedIds(new Set()), 2500);
      }

      setGameState(newState);
    });
    return () => unsubscribe();
  }, []);

  if (!gameState) {
    return (
      <div
        style={{ width: '1920px', height: '1080px', overflow: 'hidden' }}
        className="bg-black text-white flex items-center justify-center"
      >
        <p className="text-gray-600 text-4xl">Connecting...</p>
      </div>
    );
  }

  const { phase, players, showScoreboard, showLeaderboardModal } = gameState;

  function MainContent() {
    switch (phase) {
      case 'SETUP':
        return <SetupScreen />;
      case 'WARMUP':
        return <WarmupScreen gameState={gameState!} />;
      case 'SEGMENT1':
        return <Segment1Screen gameState={gameState!} />;
      case 'SEGMENT2':
        return <Segment2Screen gameState={gameState!} />;
      case 'SEGMENT3':
        return <Segment3Screen gameState={gameState!} />;
      case 'FINAL':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-8">
            <h1 className="text-[100px] font-black text-orange-500 leading-none">LIAR HEARTS</h1>
            <p className="text-5xl text-gray-400 font-semibold">Season 2</p>
          </div>
        );
      default:
        return <SetupScreen />;
    }
  }

  const isTimerRunning = gameState.banterTimer?.running && timerDisplay > 0;
  const timerMins = Math.floor(timerDisplay / 60);
  const timerSecs = String(timerDisplay % 60).padStart(2, '0');
  const timerUrgent = timerDisplay <= 10 && timerDisplay > 0;

  return (
    <div
      style={{ width: '1920px', height: '1080px', overflow: 'hidden' }}
      className="bg-black text-white relative flex font-sans"
    >
      {/* Main content area */}
      <div className={`h-full flex-1 min-w-0 relative`}>
        <MainContent />
      </div>

      {/* Scoreboard sidebar */}
      {showScoreboard && (
        <Scoreboard players={players} highlightedIds={highlightedIds} />
      )}

      {/* Banter timer overlay — bottom-left corner when running */}
      {isTimerRunning && (
        <div
          className="absolute bottom-8 left-8 flex items-center gap-4 rounded-2xl px-8 py-5"
          style={{
            backgroundColor: timerUrgent ? 'rgba(127,29,29,0.92)' : 'rgba(0,0,0,0.85)',
            border: `2px solid ${timerUrgent ? '#f87171' : '#f59e0b'}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            className="font-mono font-black tabular-nums leading-none"
            style={{
              fontSize: '80px',
              color: timerUrgent ? '#f87171' : '#f59e0b',
            }}
          >
            {timerMins}:{timerSecs}
          </span>
        </div>
      )}

      {/* Leaderboard modal */}
      {showLeaderboardModal && <LeaderboardModal players={players} />}
    </div>
  );
}
