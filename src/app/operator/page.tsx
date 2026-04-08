'use client';

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Papa from 'papaparse';

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
  showTopVoters: boolean;
  showScorePopup: boolean;
  showVoteBars: boolean;
  scorePopupDeltas: { name: string; delta: number }[];
  banterTimer: {
    totalSeconds: number;
    startedAt: number | null; // epoch ms — null when not running
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
    [uid: string]: {
      choice: string;
      votingRound: string;
      displayName?: string;
    };
  };
  voterScores: {
    [uid: string]: { name: string; correctCount: number };
  };
}

const initialGameState: GameState = {
  phase: 'SETUP',
  players: [
    { id: 1, name: 'Player 1', score: 0, photo: '/player1.png' },
    { id: 2, name: 'Player 2', score: 0, photo: '/player2.png' },
    { id: 3, name: 'Player 3', score: 0, photo: '/player3.png' },
  ],
  showScoreboard: true,
  showLeaderboardModal: false,
  showTopVoters: false,
  showScorePopup: false,
  showVoteBars: true,
  scorePopupDeltas: [],
  banterTimer: { totalSeconds: 60, startedAt: null, running: false },
  warmup: { statements: [], currentIndex: 0, audienceVotingOpen: false, showResult: false },
  segment1: {
    statements: [],
    currentStorytellerId: null,
    playerVotes: { 1: null, 2: null, 3: null },
    audienceVotingOpen: false,
    showResult: false,
    completedStorytellers: [],
  },
  segment2: {
    statements: [],
    currentStorytellerId: null,
    playerVotes: { 1: null, 2: null, 3: null },
    audienceVotingOpen: false,
    showResult: false,
    completedStorytellers: [],
  },
  segment3: { photoUrl: null, photoTitle: null, audienceVotingOpen: false, showResult: false, winnerId: null },
  audienceVotes: {},
  voterScores: {},
};

// ── Constants ──────────────────────────────────────────────────────────────

const PHASE_ORDER: GameState['phase'][] = ['SETUP', 'WARMUP', 'SEGMENT1', 'SEGMENT2', 'SEGMENT3', 'FINAL'];
const PHASE_LABELS: Record<GameState['phase'], string> = {
  SETUP: 'Setup', WARMUP: 'Warmup', SEGMENT1: 'Seg 1', SEGMENT2: 'Seg 2', SEGMENT3: 'Seg 3', FINAL: 'Final',
};

// ── Module-level components (fixes remount bug from inner definitions) ─────

function VoteBars({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const colorMap: Record<string, string> = {
    TRUTH: '#4ade80',
    LIE: '#f87171',
    STATEMENT1: '#fbbf24',
    STATEMENT2: '#a78bfa',
  };
  return (
    <div className="space-y-3 rounded-lg p-4" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
      {Object.entries(counts).map(([label, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const color = colorMap[label] ?? '#71717a';
        return (
          <div key={label} className="flex items-center gap-3">
            <span className="w-32 font-mono text-sm font-bold shrink-0" style={{ color: '#a1a1aa' }}>{label}</span>
            <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: '#27272a' }}>
              <div
                className="h-4 rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="font-mono text-sm w-24 text-right shrink-0 font-bold" style={{ color: '#e4e4e7' }}>
              {count} · {pct}%
            </span>
          </div>
        );
      })}
      <p className="font-mono text-sm pt-1" style={{ color: '#52525b' }}>TOTAL VOTES: {total}</p>
    </div>
  );
}


interface SectionCardProps {
  id: GameState['phase'];
  title: string;
  currentPhase: GameState['phase'];
  render: () => React.ReactNode;
}

function SectionCard({ id, title, currentPhase, render }: SectionCardProps) {
  const isActive = currentPhase === id;
  const isDone = PHASE_ORDER.indexOf(currentPhase) > PHASE_ORDER.indexOf(id);
  const [expanded, setExpanded] = useState(false);

  // Collapse when this segment becomes active (operator navigated here)
  useEffect(() => { if (isActive) setExpanded(false); }, [isActive]);

  if (!isActive && !isDone) return null;

  const showContent = isActive || expanded;

  return (
    <div
      className="mb-4 rounded-xl overflow-hidden"
      style={{ border: isActive ? '2px solid #f59e0b' : '1px solid #27272a', opacity: isDone && !expanded ? 0.5 : 1 }}
    >
      <div
        className="px-6 py-3 flex items-center justify-between"
        style={{ backgroundColor: isActive ? '#130f00' : '#111113', cursor: isDone ? 'pointer' : 'default' }}
        onClick={() => { if (isDone) setExpanded((v) => !v); }}
      >
        <span className="font-mono text-sm font-bold uppercase tracking-widest" style={{ color: isActive ? '#f59e0b' : '#52525b' }}>
          {isActive ? '▶ ' : '✓ '}{title}
        </span>
        {isDone && (
          <span className="font-mono text-sm" style={{ color: expanded ? '#f59e0b' : '#4ade80' }}>
            {expanded ? '▲ COLLAPSE' : '▼ EXPAND'}
          </span>
        )}
      </div>
      {showContent && <div className="p-6">{render()}</div>}
    </div>
  );
}

// ── Vote/open button pair ──────────────────────────────────────────────────


// ── Top Voters Panel ───────────────────────────────────────────────────────

function TopVotersPanel({ voterScores }: { voterScores: GameState['voterScores'] }) {
  const sorted = Object.entries(voterScores)
    .sort(([, a], [, b]) => b.correctCount - a.correctCount)
    .slice(0, 3);

  if (sorted.length === 0) {
    return <p className="font-mono text-xs px-1 pt-1" style={{ color: '#3f3f46' }}>No data yet</p>;
  }

  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
      {sorted.map(([uid, data], rank) => (
        <div key={uid} className="flex items-center gap-2">
          <span className="text-base shrink-0">{medals[rank]}</span>
          <span className="font-mono text-sm flex-1 truncate" style={{ color: '#e4e4e7' }}>{data.name}</span>
          <span className="font-mono text-sm font-bold shrink-0" style={{ color: '#f59e0b' }}>{data.correctCount} ✓</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OperatorPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [playerCount, setPlayerCount] = useState(0);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [playerPhotos, setPlayerPhotos] = useState<string[]>([]);
  const [warmupData, setWarmupData] = useState<WarmupStatement[]>([]);
  const [seg1Data, setSeg1Data] = useState<Segment1Statement[]>([]);
  const [seg2Data, setSeg2Data] = useState<Segment2Statement[]>([]);
  const [seg3Meta, setSeg3Meta] = useState<{ photoTitle: string } | null>(null);
  const [seg3Photo, setSeg3Photo] = useState<string>('');

  const [warmupVoteLocked, setWarmupVoteLocked] = useState(false);

  // Timer input + local display (computed from Firestore banterTimer)
  const [timerInput, setTimerInput] = useState('60');
  const [timerDisplaySeconds, setTimerDisplaySeconds] = useState(60);
  const timerTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [seg1Preview, setSeg1Preview] = useState<{ lines: string[]; totals: Record<number, number> } | null>(null);
  const [seg1Awarded, setSeg1Awarded] = useState(false);
  const [seg2Preview, setSeg2Preview] = useState<{ lines: string[]; totals: Record<number, number> } | null>(null);
  const [seg2Awarded, setSeg2Awarded] = useState(false);

  const [seg3ManualWinnerId, setSeg3ManualWinnerId] = useState<number | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'gameState', 'live'), (snap) => {
      if (snap.exists()) setGameState(snap.data() as GameState);
    });
    return () => unsubscribe();
  }, []);

  // Resize player name/photo arrays when count changes
  useEffect(() => {
    setPlayerNames((prev) => Array.from({ length: playerCount }, (_, i) => prev[i] ?? `Player ${i + 1}`));
    setPlayerPhotos((prev) => Array.from({ length: playerCount }, (_, i) => prev[i] ?? ''));
  }, [playerCount]);

  useEffect(() => {
    setSeg1Preview(null);
    setSeg1Awarded(false);
  }, [gameState?.segment1?.currentStorytellerId]);

  useEffect(() => {
    setSeg2Preview(null);
    setSeg2Awarded(false);
  }, [gameState?.segment2?.currentStorytellerId]);

  // Compute local display seconds from Firestore timer state
  useEffect(() => {
    const bt = gameState?.banterTimer;
    if (!bt) return;
    if (timerTickRef.current) clearInterval(timerTickRef.current);
    if (bt.running && bt.startedAt !== null) {
      const tick = () => {
        const remaining = Math.max(0, bt.totalSeconds - Math.floor((Date.now() - bt.startedAt!) / 1000));
        setTimerDisplaySeconds(remaining);
      };
      tick();
      timerTickRef.current = setInterval(tick, 250);
    } else {
      setTimerDisplaySeconds(bt.totalSeconds);
    }
    return () => { if (timerTickRef.current) clearInterval(timerTickRef.current); };
  }, [gameState?.banterTimer?.running, gameState?.banterTimer?.startedAt, gameState?.banterTimer?.totalSeconds]);

  // ── Firestore helper ───────────────────────────────────────────────────────

  const db_update = async (fields: Record<string, unknown>) => {
    try {
      await updateDoc(doc(db, 'gameState', 'live'), fields);
    } catch (e) {
      console.error('Firestore update error:', e);
      alert('Error updating game state. Check console.');
    }
  };

  // ── Voter score tally ──────────────────────────────────────────────────────

  async function awardVoterScores(votingRound: string, correctChoice: string) {
    if (!gameState) return;
    const votes = gameState.audienceVotes ?? {};
    const existing = gameState.voterScores ?? {};
    const updates: Record<string, unknown> = {};
    Object.entries(votes).forEach(([uid, v]) => {
      if (v.votingRound === votingRound && v.choice === correctChoice) {
        updates[`voterScores.${uid}`] = {
          name: v.displayName ?? uid,
          correctCount: (existing[uid]?.correctCount ?? 0) + 1,
        };
      }
    });
    if (Object.keys(updates).length > 0) await db_update(updates);
  }

  // ── Vote count helper ──────────────────────────────────────────────────────

  function getVoteCounts(votingRound: string, options: string[]): Record<string, number> {
    const counts = Object.fromEntries(options.map((o) => [o, 0]));
    Object.values(gameState?.audienceVotes ?? {}).forEach((v) => {
      if (v.votingRound === votingRound && counts[v.choice] !== undefined) counts[v.choice]++;
    });
    return counts;
  }

  // ── CSV parsers ────────────────────────────────────────────────────────────

  function parseWarmupCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        setWarmupData((results.data as Record<string, string>[]).map((row) => ({
          statement: row.statement,
          isLie: row.is_lie?.toUpperCase() === 'TRUE',
        })));
      },
      error: (err) => alert(`CSV error: ${err.message}`),
    });
  }

  function parseSeg1Csv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        setSeg1Data((results.data as Record<string, string>[]).map((row) => ({
          playerId: parseInt(row.player_id, 10),
          playerName: row.player_name,
          statement: row.statement,
          isLie: row.is_lie?.toUpperCase() === 'TRUE',
        })));
      },
      error: (err) => alert(`CSV error: ${err.message}`),
    });
  }

  function parseSeg2Csv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        setSeg2Data((results.data as Record<string, string>[]).map((row) => ({
          playerId: parseInt(row.player_id, 10),
          playerName: row.player_name,
          statement1: row.statement_1,
          statement2: row.statement_2,
          lieIndex: parseInt(row.lie_index, 10) as 1 | 2,
        })));
      },
      error: (err) => alert(`CSV error: ${err.message}`),
    });
  }

  function parseSeg3Csv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const row = (results.data as Record<string, string>[])[0];
        if (row) setSeg3Meta({ photoTitle: row.photo_title });
      },
      error: (err) => alert(`CSV error: ${err.message}`),
    });
  }

  function loadPhotoAsBase64(file: File, onDone: (b64: string) => void) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      onDone(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = url;
  }

  // ── Setup: pre-populate from existing game state (used when going back to setup) ─

  function populateSetupFromGameState(gs: GameState) {
    const count = gs.players.length;
    setPlayerCount(count);
    setPlayerNames(gs.players.map((p) => p.name));
    setPlayerPhotos(gs.players.map((p) => (p.photo.startsWith('data:') ? p.photo : '')));
    setWarmupData(gs.warmup.statements);
    setSeg1Data(gs.segment1.statements);
    setSeg2Data(gs.segment2.statements);
    if (gs.segment3.photoTitle) setSeg3Meta({ photoTitle: gs.segment3.photoTitle });
    setSeg3Photo(gs.segment3.photoUrl ?? '');
  }

  // ── Setup: validate & start ────────────────────────────────────────────────

  function validateAndStart() {
    const errors: string[] = [];
    if (playerNames.some((n) => !n.trim())) errors.push(`All ${playerCount} player names must be filled.`);
    if (warmupData.length < 1) errors.push('Warmup CSV must have at least 1 row.');
    if (seg1Data.length !== playerCount) errors.push(`Segment 1 CSV must have exactly ${playerCount} rows (one per player).`);
    if (seg2Data.length !== playerCount) errors.push(`Segment 2 CSV must have exactly ${playerCount} rows (one per player).`);
    if (!seg3Meta) errors.push('Segment 3 CSV must be uploaded.');
    if (errors.length > 0) { alert(errors.join('\n')); return; }

    const emptyVotes = Object.fromEntries(Array.from({ length: playerCount }, (_, i) => [i + 1, null]));
    const newState: GameState = {
      ...initialGameState,
      phase: 'WARMUP',
      players: playerNames.map((name, i) => ({
        id: i + 1, name: name.trim(), score: 0, photo: playerPhotos[i] || `/player${i + 1}.png`,
      })),
      warmup: { ...initialGameState.warmup, statements: warmupData },
      segment1: { ...initialGameState.segment1, statements: seg1Data, playerVotes: emptyVotes },
      segment2: { ...initialGameState.segment2, statements: seg2Data, playerVotes: emptyVotes },
      segment3: { ...initialGameState.segment3, photoUrl: seg3Photo || null, photoTitle: seg3Meta!.photoTitle },
    };
    setDoc(doc(db, 'gameState', 'live'), newState)
      .then(() => alert('Show started! Phase set to WARMUP.'))
      .catch((e: Error) => alert(`Error: ${e.message}`));
  }

  // ── Segment 1 scoring ──────────────────────────────────────────────────────

  function calcSeg1Points() {
    if (!gameState) return;
    const { players, segment1 } = gameState;
    const stmtObj = segment1.statements.find((s) => s.playerId === segment1.currentStorytellerId);
    if (!stmtObj) return;
    const storytellerId = segment1.currentStorytellerId!;
    const correctAnswer = stmtObj.isLie ? 'LIE' : 'TRUTH';
    const nonStorytellers = players.filter((p) => p.id !== storytellerId);
    const totals: Record<number, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
    const storytellerName = players.find((p) => p.id === storytellerId)?.name ?? 'Storyteller';
    const lines: string[] = [];
    nonStorytellers.forEach((player) => {
      const vote = segment1.playerVotes[player.id];
      if (vote === correctAnswer) {
        totals[player.id] += 50;
        lines.push(`${player.name} voted ${vote} → CORRECT → ${player.name} +50 pts`);
      } else if (vote) {
        totals[storytellerId] += 50;
        lines.push(`${player.name} voted ${vote} → WRONG → ${storytellerName} +50 pts`);
      } else {
        lines.push(`${player.name} did not vote`);
      }
    });
    setSeg1Preview({ lines, totals });
  }

  async function awardSeg1Points() {
    if (!gameState || !seg1Preview) return;
    const { players, segment1 } = gameState;
    const updatedPlayers = players.map((p) => ({ ...p, score: p.score + (seg1Preview.totals[p.id] ?? 0) }));
    const deltas = players
      .filter((p) => seg1Preview.totals[p.id] > 0)
      .map((p) => ({ name: p.name, delta: seg1Preview.totals[p.id] }));
    await db_update({
      players: updatedPlayers,
      'segment1.completedStorytellers': [...segment1.completedStorytellers, segment1.currentStorytellerId],
      'segment1.currentStorytellerId': null,
      'segment1.showResult': false,
      'segment1.audienceVotingOpen': false,
      'segment1.playerVotes': Object.fromEntries(players.map((p) => [p.id, null])),
      scorePopupDeltas: deltas,
      showScorePopup: false,
    });
    setSeg1Awarded(true);
  }

  // ── Segment 2 scoring ──────────────────────────────────────────────────────

  function calcSeg2Points() {
    if (!gameState) return;
    const { players, segment2 } = gameState;
    const stmtObj = segment2.statements.find((s) => s.playerId === segment2.currentStorytellerId);
    if (!stmtObj) return;
    const storytellerId = segment2.currentStorytellerId!;
    const correctAnswer = stmtObj.lieIndex === 1 ? 'STATEMENT1' : 'STATEMENT2';
    const nonStorytellers = players.filter((p) => p.id !== storytellerId);
    const totals: Record<number, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
    const storytellerName = players.find((p) => p.id === storytellerId)?.name ?? 'Storyteller';
    const lines: string[] = [];
    nonStorytellers.forEach((player) => {
      const vote = segment2.playerVotes[player.id];
      if (vote === correctAnswer) {
        totals[player.id] += 100;
        lines.push(`${player.name} voted ${vote} → CORRECT → ${player.name} +100 pts`);
      } else if (vote) {
        totals[storytellerId] += 100;
        lines.push(`${player.name} voted ${vote} → WRONG → ${storytellerName} +100 pts`);
      } else {
        lines.push(`${player.name} did not vote`);
      }
    });
    setSeg2Preview({ lines, totals });
  }

  async function awardSeg2Points() {
    if (!gameState || !seg2Preview) return;
    const { players, segment2 } = gameState;
    const updatedPlayers = players.map((p) => ({ ...p, score: p.score + (seg2Preview.totals[p.id] ?? 0) }));
    const deltas = players
      .filter((p) => seg2Preview.totals[p.id] > 0)
      .map((p) => ({ name: p.name, delta: seg2Preview.totals[p.id] }));
    await db_update({
      players: updatedPlayers,
      'segment2.completedStorytellers': [...segment2.completedStorytellers, segment2.currentStorytellerId],
      'segment2.currentStorytellerId': null,
      'segment2.showResult': false,
      'segment2.audienceVotingOpen': false,
      'segment2.playerVotes': Object.fromEntries(players.map((p) => [p.id, null])),
      scorePopupDeltas: deltas,
      showScorePopup: false,
    });
    setSeg2Awarded(true);
  }

  // ── Segment 3 winner ───────────────────────────────────────────────────────

  function getSeg3Winner() {
    if (!gameState) return null;
    const { players } = gameState;
    const counts: Record<number, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
    Object.values(gameState.audienceVotes ?? {}).forEach((v) => {
      if (v.votingRound === 'seg3') {
        const id = parseInt(v.choice, 10);
        if (counts[id] !== undefined) counts[id]++;
      }
    });
    const maxCount = Math.max(...Object.values(counts));
    const winners = players.filter((p) => counts[p.id] === maxCount);
    return { counts, winners, isTie: winners.length > 1, maxCount };
  }

  async function awardSeg3Points(winnerId: number) {
    if (!gameState) return;
    const winner = gameState.players.find((p) => p.id === winnerId);
    const updatedPlayers = gameState.players.map((p) =>
      p.id === winnerId ? { ...p, score: p.score + 300 } : p
    );
    await db_update({
      players: updatedPlayers,
      'segment3.winnerId': winnerId,
      'segment3.showResult': true,
      scorePopupDeltas: winner ? [{ name: winner.name, delta: 300 }] : [],
      showScorePopup: false,
    });
    await awardVoterScores('seg3', String(winnerId));
  }

  // ── Render helpers (plain functions, NOT component definitions) ────────────

  function renderBanterTimer() {
    const bt = gameState?.banterTimer;
    const isRunning = bt?.running ?? false;
    const mins = Math.floor(timerDisplaySeconds / 60);
    const secs = String(timerDisplaySeconds % 60).padStart(2, '0');
    const isUrgent = timerDisplaySeconds <= 10 && timerDisplaySeconds > 0;
    const isDone = timerDisplaySeconds === 0;
    const parsedInput = Math.max(1, parseInt(timerInput) || 60);

    return (
      <div className="rounded-xl p-4" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
        <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#52525b' }}>Banter Timer</p>
        <div className="flex items-center gap-4 mb-4">
          <span
            className="font-mono text-5xl font-bold tabular-nums"
            style={{ color: isDone ? '#f87171' : isUrgent ? '#fbbf24' : '#fafafa' }}
          >
            {mins}:{secs}
          </span>
          {isRunning && (
            <span className="font-mono text-sm" style={{ color: '#4ade80' }}>
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 animate-pulse" style={{ backgroundColor: '#4ade80' }} />
              RUNNING
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="number"
            min={1}
            max={600}
            value={timerInput}
            onChange={(e) => setTimerInput(e.target.value)}
            disabled={isRunning}
            className="w-24 px-3 py-2 rounded font-mono text-sm outline-none disabled:opacity-40"
            style={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', color: '#fafafa' }}
            placeholder="60"
          />
          <span className="font-mono text-xs" style={{ color: '#52525b' }}>seconds</span>
        </div>
        <div className="flex gap-2">
          <button
            disabled={isRunning || (isDone && !bt?.startedAt)}
            onClick={() => db_update({ 'banterTimer.running': true, 'banterTimer.startedAt': Date.now(), 'banterTimer.totalSeconds': parsedInput })}
            className="px-4 py-2.5 rounded font-mono text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: '#f59e0b', color: '#09090b' }}
          >
            START
          </button>
          <button
            disabled={!isRunning}
            onClick={() => db_update({ 'banterTimer.running': false, 'banterTimer.startedAt': null, 'banterTimer.totalSeconds': timerDisplaySeconds })}
            className="px-4 py-2.5 rounded font-mono text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: '#27272a', color: '#a1a1aa', border: '1px solid #3f3f46' }}
          >
            STOP
          </button>
          <button
            onClick={() => db_update({ 'banterTimer.running': false, 'banterTimer.startedAt': null, 'banterTimer.totalSeconds': parsedInput })}
            className="px-4 py-2.5 rounded font-mono text-sm font-bold transition-colors"
            style={{ backgroundColor: '#27272a', color: '#a1a1aa', border: '1px solid #3f3f46' }}
          >
            RESET
          </button>
        </div>
      </div>
    );
  }

  function renderRightPanel() {
    if (!gameState) return null;

    // Determine current vote context
    type VoteCtx = { isOpen: boolean; onOpen: () => void; onLock: () => void; label: string } | null;
    const voteCtx: VoteCtx = (() => {
      switch (currentPhase) {
        case 'WARMUP':
          return {
            isOpen: gameState.warmup.audienceVotingOpen,
            onOpen: () => db_update({ 'warmup.audienceVotingOpen': true }),
            onLock: () => { setWarmupVoteLocked(true); db_update({ 'warmup.audienceVotingOpen': false }); },
            label: 'WARMUP VOTE',
          };
        case 'SEGMENT1':
          if (!gameState.segment1.currentStorytellerId) return null;
          return {
            isOpen: gameState.segment1.audienceVotingOpen,
            onOpen: () => db_update({ 'segment1.audienceVotingOpen': true }),
            onLock: () => db_update({ 'segment1.audienceVotingOpen': false }),
            label: 'AUDIENCE VOTE',
          };
        case 'SEGMENT2':
          if (!gameState.segment2.currentStorytellerId) return null;
          return {
            isOpen: gameState.segment2.audienceVotingOpen,
            onOpen: () => db_update({ 'segment2.audienceVotingOpen': true }),
            onLock: () => db_update({ 'segment2.audienceVotingOpen': false }),
            label: 'AUDIENCE VOTE',
          };
        case 'SEGMENT3':
          return {
            isOpen: gameState.segment3.audienceVotingOpen,
            onOpen: () => db_update({ 'segment3.audienceVotingOpen': true }),
            onLock: () => db_update({ 'segment3.audienceVotingOpen': false }),
            label: 'AUDIENCE VOTE',
          };
        default:
          return null;
      }
    })();

    const panelBtn = (label: string, onClick: () => void, style: React.CSSProperties, disabled = false) => (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full px-4 py-3 rounded-lg font-mono text-sm font-bold text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={style}
      >
        {label}
      </button>
    );

    return (
      <aside
        className="w-56 shrink-0 sticky self-start overflow-y-auto"
        style={{
          top: '73px',
          height: 'calc(100vh - 73px)',
          borderLeft: '1px solid #27272a',
          backgroundColor: '#0a0a0c',
        }}
      >
        <div className="p-4 space-y-6">

          {/* Audience Vote */}
          {voteCtx ? (
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>{voteCtx.label}</p>
              {panelBtn(
                'OPEN VOTE',
                voteCtx.onOpen,
                { backgroundColor: voteCtx.isOpen ? '#1a1a1a' : '#052e16', color: voteCtx.isOpen ? '#3f3f46' : '#4ade80', border: `1px solid ${voteCtx.isOpen ? '#27272a' : '#166534'}` },
                voteCtx.isOpen,
              )}
              {panelBtn(
                'LOCK VOTE',
                voteCtx.onLock,
                { backgroundColor: !voteCtx.isOpen ? '#1a1a1a' : '#450a0a', color: !voteCtx.isOpen ? '#3f3f46' : '#f87171', border: `1px solid ${!voteCtx.isOpen ? '#27272a' : '#7f1d1d'}` },
                !voteCtx.isOpen,
              )}
              {voteCtx.isOpen && (
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: '#4ade80' }} />
                  <span className="font-mono text-sm" style={{ color: '#4ade80' }}>VOTING LIVE</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>AUDIENCE VOTE</p>
              <p className="font-mono text-xs" style={{ color: '#3f3f46' }}>No active vote in this phase</p>
            </div>
          )}

          <div style={{ borderTop: '1px solid #27272a' }} />

          {/* Display controls */}
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>DISPLAY</p>
            {panelBtn(
              gameState.showScoreboard ? '● Scoreboard ON' : '○ Scoreboard OFF',
              () => db_update({ showScoreboard: !gameState.showScoreboard }),
              { border: '1px solid #27272a', backgroundColor: 'transparent', color: gameState.showScoreboard ? '#4ade80' : '#52525b' },
            )}
            {panelBtn(
              gameState.showLeaderboardModal ? '● Leaderboard ON' : '○ Leaderboard OFF',
              () => db_update({ showLeaderboardModal: !gameState.showLeaderboardModal }),
              { border: '1px solid #27272a', backgroundColor: 'transparent', color: gameState.showLeaderboardModal ? '#4ade80' : '#52525b' },
            )}
            {panelBtn(
              gameState.showScorePopup ? '● Score Popup ON' : '○ Score Popup OFF',
              () => db_update({ showScorePopup: !gameState.showScorePopup }),
              { border: '1px solid #27272a', backgroundColor: 'transparent', color: gameState.showScorePopup ? '#4ade80' : '#52525b' },
              (gameState.scorePopupDeltas ?? []).length === 0,
            )}
            {panelBtn(
              (gameState.showVoteBars ?? true) ? '● Vote Bars ON' : '○ Vote Bars OFF',
              () => db_update({ showVoteBars: !(gameState.showVoteBars ?? true) }),
              { border: '1px solid #27272a', backgroundColor: 'transparent', color: (gameState.showVoteBars ?? true) ? '#4ade80' : '#52525b' },
            )}
          </div>

          <div style={{ borderTop: '1px solid #27272a' }} />

          {/* Top Voters */}
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>AUDIENCE</p>
            {panelBtn(
              gameState.showTopVoters ? '● Top Voters ON' : '○ Top Voters OFF',
              () => db_update({ showTopVoters: !gameState.showTopVoters }),
              { border: '1px solid #27272a', backgroundColor: 'transparent', color: gameState.showTopVoters ? '#4ade80' : '#52525b' },
            )}
            {gameState.showTopVoters && <TopVotersPanel voterScores={gameState.voterScores ?? {}} />}
          </div>

          <div style={{ borderTop: '1px solid #27272a' }} />

          {/* Back to setup */}
          {currentPhase !== 'SETUP' && (
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>SETUP</p>
              {panelBtn(
                '← BACK TO SETUP',
                () => {
                  if (confirm('Go back to setup? The game will pause. You can fix names, photos, or CSVs and restart.')) {
                    populateSetupFromGameState(gameState);
                    db_update({ phase: 'SETUP' });
                  }
                },
                { backgroundColor: '#0f0f12', color: '#a1a1aa', border: '1px solid #3f3f46' },
              )}
            </div>
          )}

          <div style={{ borderTop: '1px solid #27272a' }} />

          {/* Reset */}
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>DANGER</p>
            {panelBtn(
              'RESET GAME',
              () => { if (confirm('Reset the entire game? This cannot be undone.')) setDoc(doc(db, 'gameState', 'live'), initialGameState); },
              { backgroundColor: '#1c0000', color: '#f87171', border: '1px solid #7f1d1d' },
            )}
          </div>

        </div>
      </aside>
    );
  }

  function renderSetup() {
    const countReady = playerCount >= 2;

    return (
      <div className="space-y-8">

        {/* Step 1: Number of players */}
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>Step 1 — How many players?</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 4"
            value={playerCount === 0 ? '' : playerCount}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') { setPlayerCount(0); return; }
              const v = parseInt(raw);
              if (!isNaN(v)) setPlayerCount(v);
            }}
            onBlur={() => { if (playerCount > 0) setPlayerCount((c) => Math.max(2, c)); }}
            className="w-32 px-4 py-3 rounded-lg font-mono text-xl outline-none"
            style={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', color: '#fafafa' }}
            onFocus={(e) => (e.target.style.borderColor = '#f59e0b')}
          />
          {playerCount === 1 && (
            <p className="font-mono text-sm" style={{ color: '#f87171' }}>Need at least 2 players.</p>
          )}
        </div>

        {/* Step 2: Player names + photos (appears once count is valid) */}
        {countReady && (
          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>Step 2 — Player names & photos</p>
            <div className="space-y-3">
              {Array.from({ length: playerCount }, (_, i) => i).map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="font-mono text-sm w-6 shrink-0" style={{ color: '#52525b' }}>P{i + 1}</span>
                  <input
                    type="text"
                    value={playerNames[i] ?? ''}
                    onChange={(e) => setPlayerNames((prev) => { const n = [...prev]; n[i] = e.target.value; return n; })}
                    placeholder={`Player ${i + 1} name`}
                    className="flex-1 px-4 py-3 rounded-lg text-base outline-none transition-colors font-mono"
                    style={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', color: '#fafafa' }}
                    onFocus={(e) => (e.target.style.borderColor = '#f59e0b')}
                    onBlur={(e) => (e.target.style.borderColor = '#3f3f46')}
                  />
                  <label className="cursor-pointer px-4 py-3 rounded-lg font-mono text-sm transition-colors shrink-0"
                    style={{ border: '1px solid #3f3f46', color: '#71717a' }}>
                    Photo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) loadPhotoAsBase64(file, (b64) => setPlayerPhotos((prev) => { const p = [...prev]; p[i] = b64; return p; }));
                    }} />
                  </label>
                  {playerPhotos[i] && (
                    <img src={playerPhotos[i]} className="w-11 h-11 rounded-full object-cover shrink-0"
                      style={{ outline: '2px solid #f59e0b', outlineOffset: '2px' }} alt="" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: CSV uploads + photo (appears once count is valid) */}
        {countReady && (
          <div className="space-y-4">
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>Step 3 — Upload CSVs & segment 3 photo</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'WARMUP CSV', sample: '/warmup_sample.csv', onChange: parseWarmupCsv, count: warmupData.length, preview: warmupData.map((r) => r.statement) },
                { label: 'SEGMENT 1 CSV', sample: '/segment1_sample.csv', onChange: parseSeg1Csv, count: seg1Data.length, preview: seg1Data.map((r) => `${r.playerName}: ${r.statement}`) },
                { label: 'SEGMENT 2 CSV', sample: '/segment2_sample.csv', onChange: parseSeg2Csv, count: seg2Data.length, preview: seg2Data.map((r) => `${r.playerName}: "${r.statement1}" / "${r.statement2}"`) },
                { label: 'SEGMENT 3 CSV', sample: '/segment3_sample.csv', onChange: parseSeg3Csv, count: seg3Meta ? 1 : 0, preview: seg3Meta ? [seg3Meta.photoTitle] : [] },
              ].map(({ label, sample, onChange, count, preview }) => (
                <div key={label} className="rounded-lg p-4" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-sm font-bold uppercase tracking-widest" style={{ color: '#a1a1aa' }}>{label}</span>
                    <div className="flex items-center gap-3">
                      {count > 0 && <span className="font-mono text-sm" style={{ color: '#4ade80' }}>✓ {count} row{count !== 1 ? 's' : ''}</span>}
                      <a href={sample} download className="font-mono text-sm underline" style={{ color: '#f59e0b' }}>sample</a>
                    </div>
                  </div>
                  <label className="cursor-pointer inline-flex">
                    <span className="px-4 py-2 rounded font-mono text-sm" style={{ border: '1px solid #3f3f46', color: '#71717a' }}>Choose file</span>
                    <input type="file" accept=".csv" onChange={onChange} className="hidden" />
                  </label>
                  {count > 0 && (
                    <div className="mt-2 space-y-0.5 max-h-16 overflow-y-auto">
                      {preview.map((line, i) => (
                        <p key={i} className="font-mono text-sm truncate" style={{ color: '#52525b' }}>{i + 1}. {line}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="rounded-lg p-4" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
                <p className="font-mono text-sm font-bold uppercase tracking-widest mb-3" style={{ color: '#a1a1aa' }}>SEGMENT 3 OBJECT PHOTO</p>
                <label className="cursor-pointer inline-flex">
                  <span className="px-4 py-2 rounded font-mono text-sm" style={{ border: '1px solid #3f3f46', color: '#71717a' }}>Choose photo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) loadPhotoAsBase64(file, setSeg3Photo);
                  }} />
                </label>
                {seg3Photo && <img src={seg3Photo} alt="Object preview" className="h-24 rounded-lg object-cover mt-3" style={{ border: '1px solid #3f3f46' }} />}
              </div>
            </div>
          </div>
        )}

        {/* Validate & start */}
        {countReady && (
          <button
            onClick={validateAndStart}
            className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
            style={{ backgroundColor: '#f59e0b', color: '#09090b' }}
          >
            VALIDATE &amp; START SHOW →
          </button>
        )}

      </div>
    );
  }

  function renderWarmup() {
    if (!gameState) return null;
    const { warmup } = gameState;
    const stmt = warmup.statements[warmup.currentIndex];
    const counts = getVoteCounts(`warmup-${warmup.currentIndex}`, ['TRUTH', 'LIE']);

    const goTo = (newIndex: number) => {
      setWarmupVoteLocked(false);
      db_update({ 'warmup.currentIndex': newIndex, 'warmup.audienceVotingOpen': false, 'warmup.showResult': false, audienceVotes: {} });
    };

    return (
      <div className="grid grid-cols-2 gap-6">
        {/* Left: statement + nav */}
        <div className="space-y-5">
          <div className="rounded-xl p-5" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
            <p className="font-mono text-sm uppercase tracking-widest mb-3" style={{ color: '#52525b' }}>
              STATEMENT {warmup.currentIndex + 1} OF {warmup.statements.length}
            </p>
            <p className="text-lg leading-relaxed" style={{ color: '#fafafa' }}>{stmt?.statement}</p>
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid #27272a' }}>
              <span
                className="font-mono text-sm font-bold px-3 py-1 rounded"
                style={{ backgroundColor: stmt?.isLie ? '#450a0a' : '#052e16', color: stmt?.isLie ? '#f87171' : '#4ade80' }}
              >
                ANSWER: {stmt?.isLie ? 'LIE' : 'TRUTH'}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button disabled={warmup.currentIndex === 0} onClick={() => goTo(warmup.currentIndex - 1)}
              className="px-6 py-3 rounded-lg font-mono text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ border: '1px solid #3f3f46', color: '#a1a1aa' }}>
              ← PREV
            </button>
            <button disabled={warmup.currentIndex >= warmup.statements.length - 1} onClick={() => goTo(warmup.currentIndex + 1)}
              className="px-6 py-3 rounded-lg font-mono text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ border: '1px solid #3f3f46', color: '#a1a1aa' }}>
              NEXT →
            </button>
          </div>

          <div className="pt-4" style={{ borderTop: '1px solid #27272a' }}>
            <button onClick={() => db_update({ phase: 'SEGMENT1' })}
              className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
              style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
              MOVE TO SEGMENT 1 →
            </button>
          </div>
        </div>

        {/* Right: vote bars + reveal */}
        <div className="space-y-5">
          <VoteBars counts={counts} />
          {warmupVoteLocked && !warmup.showResult && (
            <button onClick={() => {
              db_update({ 'warmup.showResult': true });
              awardVoterScores(`warmup-${warmup.currentIndex}`, stmt?.isLie ? 'LIE' : 'TRUTH');
            }}
              className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
              style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
              REVEAL ANSWER
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderStorytellersGrid(
    players: Player[],
    completedStorytellers: number[],
    currentStorytellerId: number | null,
    onSelect: (id: number) => void,
  ) {
    return (
      <div>
        <p className="font-mono text-sm uppercase tracking-widest mb-4" style={{ color: '#52525b' }}>Select Storyteller</p>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(players.length, 5)}, minmax(0, 1fr))`, gap: '12px' }}>
          {players.map((player) => {
            const isDone = completedStorytellers.includes(player.id);
            const isSelected = currentStorytellerId === player.id;
            return (
              <button
                key={player.id}
                disabled={isDone}
                onClick={() => onSelect(player.id)}
                className="flex flex-col items-center gap-3 p-5 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  border: isSelected ? '2px solid #f59e0b' : '1px solid #3f3f46',
                  backgroundColor: isSelected ? '#130f00' : '#18181b',
                }}
              >
                {player.photo && (
                  <img src={player.photo} className="w-16 h-16 rounded-full object-cover" alt="" />
                )}
                <span className="font-mono text-base font-bold" style={{ color: isSelected ? '#f59e0b' : '#a1a1aa' }}>
                  {player.name}
                </span>
                {isDone && <span className="font-mono text-sm" style={{ color: '#4ade80' }}>✓ DONE</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderSeg1() {
    if (!gameState) return null;
    const { segment1, players } = gameState;
    const stmtObj = segment1.statements.find((s) => s.playerId === segment1.currentStorytellerId);
    const nonStorytellers = players.filter((p) => p.id !== segment1.currentStorytellerId);
    const counts = getVoteCounts(`seg1-${segment1.currentStorytellerId}`, ['TRUTH', 'LIE']);
    const allDone = segment1.completedStorytellers.length === players.length;

    return (
      <div className="space-y-6">
        {renderStorytellersGrid(players, segment1.completedStorytellers, segment1.currentStorytellerId, (id) =>
          db_update({
            'segment1.currentStorytellerId': id,
            'segment1.playerVotes': Object.fromEntries(players.map((p) => [p.id, null])),
            'segment1.audienceVotingOpen': false,
            'segment1.showResult': false,
          })
        )}

        {stmtObj && (
          <div className="grid grid-cols-2 gap-6">
            {/* Left col: statement + player votes */}
            <div className="space-y-5">
              <div className="rounded-xl p-5" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
                <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#52525b' }}>STATEMENT</p>
                <p className="text-lg leading-relaxed" style={{ color: '#fafafa' }}>{stmtObj.statement}</p>
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid #27272a' }}>
                  <span className="font-mono text-sm font-bold px-3 py-1 rounded"
                    style={{ backgroundColor: stmtObj.isLie ? '#450a0a' : '#052e16', color: stmtObj.isLie ? '#f87171' : '#4ade80' }}>
                    ANSWER: {stmtObj.isLie ? 'LIE' : 'TRUTH'}
                  </span>
                </div>
              </div>

              <div>
                <p className="font-mono text-sm uppercase tracking-widest mb-4" style={{ color: '#52525b' }}>Log Player Votes</p>
                <div className="space-y-3">
                  {nonStorytellers.map((player) => (
                    <div key={player.id} className="flex items-center gap-3">
                      <span className="font-mono text-base font-semibold w-28 shrink-0" style={{ color: '#e4e4e7' }}>{player.name}</span>
                      {(['TRUTH', 'LIE'] as const).map((vote) => {
                        const selected = segment1.playerVotes[player.id] === vote;
                        const isLie = vote === 'LIE';
                        return (
                          <button key={vote}
                            onClick={() => db_update({ [`segment1.playerVotes.${player.id}`]: vote })}
                            className="flex-1 py-3 rounded-lg font-mono text-sm font-bold transition-colors"
                            style={{
                              backgroundColor: selected ? (isLie ? '#450a0a' : '#052e16') : '#27272a',
                              color: selected ? (isLie ? '#f87171' : '#4ade80') : '#71717a',
                              border: `1px solid ${selected ? (isLie ? '#7f1d1d' : '#166534') : '#3f3f46'}`,
                            }}>
                            {vote}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right col: timer + vote bars + reveal + points */}
            <div className="space-y-5">
              {renderBanterTimer()}
              <VoteBars counts={counts} />

              {!segment1.showResult && (
                <button onClick={() => {
                  db_update({ 'segment1.showResult': true });
                  calcSeg1Points();
                  if (stmtObj) awardVoterScores(`seg1-${segment1.currentStorytellerId}`, stmtObj.isLie ? 'LIE' : 'TRUTH');
                }}
                  className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
                  style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
                  REVEAL TRUTH / LIE
                </button>
              )}

              {seg1Preview && !seg1Awarded && (
                <div className="rounded-xl p-5 space-y-3"
                  style={{ backgroundColor: '#0d0d0f', border: '1px solid #78350f' }}>
                  <p className="font-mono text-sm font-bold uppercase tracking-widest" style={{ color: '#f59e0b' }}>POINTS BREAKDOWN</p>
                  {seg1Preview.lines.map((line, i) => (
                    <p key={i} className="font-mono text-sm" style={{ color: '#a1a1aa' }}>{line}</p>
                  ))}
                  <p className="font-mono text-sm font-bold" style={{ color: '#fafafa' }}>
                    TOTAL: {players.map((p) => seg1Preview.totals[p.id] ? `${p.name} +${seg1Preview.totals[p.id]}` : null).filter(Boolean).join(', ') || 'No changes'}
                  </p>
                  <button onClick={awardSeg1Points}
                    className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
                    style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
                    CONFIRM &amp; AWARD POINTS
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pt-4" style={{ borderTop: '1px solid #27272a' }}>
          {allDone ? (
            <button onClick={() => db_update({ phase: 'SEGMENT2' })}
              className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
              style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
              MOVE TO SEGMENT 2 →
            </button>
          ) : (
            <p className="font-mono text-sm" style={{ color: '#52525b' }}>
              {segment1.completedStorytellers.length} OF {players.length} STORYTELLERS DONE
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderSeg2() {
    if (!gameState) return null;
    const { segment2, players } = gameState;
    const stmtObj = segment2.statements.find((s) => s.playerId === segment2.currentStorytellerId);
    const nonStorytellers = players.filter((p) => p.id !== segment2.currentStorytellerId);
    const counts = getVoteCounts(`seg2-${segment2.currentStorytellerId}`, ['STATEMENT1', 'STATEMENT2']);
    const allDone = segment2.completedStorytellers.length === players.length;

    return (
      <div className="space-y-6">
        {renderStorytellersGrid(players, segment2.completedStorytellers, segment2.currentStorytellerId, (id) =>
          db_update({
            'segment2.currentStorytellerId': id,
            'segment2.playerVotes': Object.fromEntries(players.map((p) => [p.id, null])),
            'segment2.audienceVotingOpen': false,
            'segment2.showResult': false,
          })
        )}

        {stmtObj && (
          <div className="grid grid-cols-2 gap-6">
            {/* Left col: statements + player votes */}
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-4" style={{ border: '1px solid #78350f', backgroundColor: '#0f0900' }}>
                  <p className="font-mono text-sm font-bold mb-2" style={{ color: '#fbbf24' }}>STATEMENT 1</p>
                  <p className="text-base leading-relaxed" style={{ color: '#fafafa' }}>{stmtObj.statement1}</p>
                </div>
                <div className="rounded-xl p-4" style={{ border: '1px solid #4c1d95', backgroundColor: '#080010' }}>
                  <p className="font-mono text-sm font-bold mb-2" style={{ color: '#a78bfa' }}>STATEMENT 2</p>
                  <p className="text-base leading-relaxed" style={{ color: '#fafafa' }}>{stmtObj.statement2}</p>
                </div>
              </div>
              <span className="font-mono text-sm font-bold px-3 py-1.5 rounded inline-block"
                style={{ backgroundColor: '#1c0a00', color: '#f59e0b', border: '1px solid #78350f' }}>
                LIE IS STATEMENT {stmtObj.lieIndex}
              </span>

              <div>
                <p className="font-mono text-sm uppercase tracking-widest mb-4" style={{ color: '#52525b' }}>Log Player Votes</p>
                <div className="space-y-3">
                  {nonStorytellers.map((player) => (
                    <div key={player.id} className="flex items-center gap-3">
                      <span className="font-mono text-base font-semibold w-28 shrink-0" style={{ color: '#e4e4e7' }}>{player.name}</span>
                      {([
                        { value: 'STATEMENT1', label: 'STMT 1 IS LIE', bg: '#78350f', color: '#fbbf24', border: '#92400e' },
                        { value: 'STATEMENT2', label: 'STMT 2 IS LIE', bg: '#4c1d95', color: '#c4b5fd', border: '#5b21b6' },
                      ] as const).map(({ value, label, bg, color, border }) => {
                        const selected = segment2.playerVotes[player.id] === value;
                        return (
                          <button key={value}
                            onClick={() => db_update({ [`segment2.playerVotes.${player.id}`]: value })}
                            className="flex-1 py-3 rounded-lg font-mono text-sm font-bold transition-colors"
                            style={{
                              backgroundColor: selected ? bg : '#27272a',
                              color: selected ? color : '#71717a',
                              border: `1px solid ${selected ? border : '#3f3f46'}`,
                            }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right col: timer + vote bars + reveal + points */}
            <div className="space-y-5">
              {renderBanterTimer()}
              <VoteBars counts={counts} />

              {!segment2.showResult && (
                <button onClick={() => {
                  db_update({ 'segment2.showResult': true });
                  calcSeg2Points();
                  if (stmtObj) awardVoterScores(`seg2-${segment2.currentStorytellerId}`, stmtObj.lieIndex === 1 ? 'STATEMENT1' : 'STATEMENT2');
                }}
                  className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
                  style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
                  REVEAL TRUTH / LIE
                </button>
              )}

              {seg2Preview && !seg2Awarded && (
                <div className="rounded-xl p-5 space-y-3"
                  style={{ backgroundColor: '#0d0d0f', border: '1px solid #78350f' }}>
                  <p className="font-mono text-sm font-bold uppercase tracking-widest" style={{ color: '#f59e0b' }}>POINTS BREAKDOWN</p>
                  {seg2Preview.lines.map((line, i) => (
                    <p key={i} className="font-mono text-sm" style={{ color: '#a1a1aa' }}>{line}</p>
                  ))}
                  <p className="font-mono text-sm font-bold" style={{ color: '#fafafa' }}>
                    TOTAL: {players.map((p) => seg2Preview.totals[p.id] ? `${p.name} +${seg2Preview.totals[p.id]}` : null).filter(Boolean).join(', ') || 'No changes'}
                  </p>
                  <button onClick={awardSeg2Points}
                    className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
                    style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
                    CONFIRM &amp; AWARD POINTS
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pt-4" style={{ borderTop: '1px solid #27272a' }}>
          {allDone ? (
            <button onClick={() => db_update({ phase: 'SEGMENT3' })}
              className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
              style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
              MOVE TO SEGMENT 3 →
            </button>
          ) : (
            <p className="font-mono text-sm" style={{ color: '#52525b' }}>
              {segment2.completedStorytellers.length} OF {players.length} STORYTELLERS DONE
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderSeg3() {
    if (!gameState) return null;
    const { segment3, players } = gameState;
    const seg3Result = getSeg3Winner();

    const playerVoteCounts: Record<number, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
    Object.values(gameState.audienceVotes ?? {}).forEach((v) => {
      if (v.votingRound === 'seg3') {
        const id = parseInt(v.choice, 10);
        if (playerVoteCounts[id] !== undefined) playerVoteCounts[id]++;
      }
    });
    const totalVotes = Object.values(playerVoteCounts).reduce((a, b) => a + b, 0);

    // Bug fix: manual winner only applies when there IS an active tie
    const effectiveWinnerId = seg3Result?.isTie
      ? seg3ManualWinnerId
      : seg3Result?.winners[0]?.id ?? null;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-5 items-start">
          <div className="rounded-xl p-5" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
            {segment3.photoUrl && (
              <img src={segment3.photoUrl} alt={segment3.photoTitle ?? ''} className="h-36 rounded-lg object-cover w-full" />
            )}
            <p className="font-mono text-sm mt-3" style={{ color: '#4ade80' }}>● Showing on display screen</p>
          </div>
          <div>
            <p className="font-mono text-sm uppercase tracking-widest mb-2" style={{ color: '#52525b' }}>Audience Vote</p>
            <p className="font-mono text-sm" style={{ color: gameState.segment3.audienceVotingOpen ? '#4ade80' : '#52525b' }}>
              {gameState.segment3.audienceVotingOpen ? '● Voting is live — use right panel to lock' : '○ Use right panel to open vote'}
            </p>
          </div>
        </div>

        <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
          {players.map((player) => {
            const count = playerVoteCounts[player.id] ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            return (
              <div key={player.id} className="flex items-center gap-4">
                {player.photo && <img src={player.photo} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />}
                <span className="font-mono text-base font-semibold w-28 shrink-0" style={{ color: '#e4e4e7' }}>{player.name}</span>
                <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: '#27272a' }}>
                  <div className="h-4 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: '#f59e0b' }} />
                </div>
                <span className="font-mono text-sm font-bold w-24 text-right shrink-0" style={{ color: '#e4e4e7' }}>{count} ({pct}%)</span>
              </div>
            );
          })}
          <p className="font-mono text-sm" style={{ color: '#52525b' }}>TOTAL VOTES: {totalVotes}</p>
        </div>

        {seg3Result && totalVotes > 0 && (
          <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
            {!seg3Result.isTie ? (
              <p className="font-mono text-lg" style={{ color: '#fafafa' }}>
                WINNER: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{seg3Result.winners[0]?.name}</span>{' '}
                <span style={{ color: '#52525b' }}>({seg3Result.maxCount} votes)</span>
              </p>
            ) : (
              <div>
                <p className="font-mono text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#fbbf24' }}>
                  TIE DETECTED — Select winner manually:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(players.length, 5)}, minmax(0, 1fr))`, gap: '12px' }}>
                  {players.map((p) => (
                    <button key={p.id} onClick={() => setSeg3ManualWinnerId(p.id)}
                      className="p-4 rounded-xl font-mono text-base font-bold transition-all"
                      style={{
                        border: seg3ManualWinnerId === p.id ? '2px solid #f59e0b' : '1px solid #3f3f46',
                        backgroundColor: seg3ManualWinnerId === p.id ? '#130f00' : '#18181b',
                        color: seg3ManualWinnerId === p.id ? '#f59e0b' : '#a1a1aa',
                      }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {effectiveWinnerId && !segment3.showResult && (
              <button onClick={() => awardSeg3Points(effectiveWinnerId)}
                className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
                style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
                AWARD 300 PTS TO {players.find((p) => p.id === effectiveWinnerId)?.name?.toUpperCase()}
              </button>
            )}
          </div>
        )}

        <div className="pt-4" style={{ borderTop: '1px solid #27272a' }}>
          <button onClick={() => db_update({ phase: 'FINAL', showLeaderboardModal: true })}
            className="w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-widest transition-colors"
            style={{ backgroundColor: '#f59e0b', color: '#09090b' }}>
            SHOW FINAL SCOREBOARD →
          </button>
        </div>
      </div>
    );
  }

  function renderFinal() {
    const audienceUrl = `${origin}/audience`;
    return (
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <p className="font-mono text-sm uppercase tracking-widest" style={{ color: '#52525b' }}>Display Controls</p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => db_update({ showLeaderboardModal: true })}
              className="px-5 py-3 rounded-lg font-mono text-sm font-bold transition-colors"
              style={{ border: '1px solid #3f3f46', color: '#a1a1aa' }}>
              SHOW FULL SCOREBOARD
            </button>
            <button onClick={() => db_update({ showLeaderboardModal: false })}
              className="px-5 py-3 rounded-lg font-mono text-sm font-bold transition-colors"
              style={{ border: '1px solid #3f3f46', color: '#a1a1aa' }}>
              HIDE SCOREBOARD
            </button>
          </div>
          <p className="font-mono text-xs" style={{ color: '#3f3f46' }}>Use the right panel to reset the game.</p>
        </div>

        {origin && (
          <div className="rounded-xl p-5 text-center" style={{ backgroundColor: '#0d0d0f', border: '1px solid #27272a' }}>
            <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#52525b' }}>Audience Voting URL</p>
            <p className="font-mono text-sm mb-4 break-all" style={{ color: '#f59e0b' }}>{audienceUrl}</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(audienceUrl)}&bgcolor=0d0d0f&color=f59e0b`}
              alt="QR Code for audience"
              className="mx-auto rounded-lg"
              width={160} height={160}
            />
            <p className="font-mono text-sm mt-3" style={{ color: '#52525b' }}>Scan to access audience voting</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#09090b' }}>
        <div className="text-center">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#52525b' }}>Connecting to Firestore…</p>
        </div>
      </div>
    );
  }

  const rawPhase = gameState.phase as string;
  const isValidPhase = (PHASE_ORDER as string[]).includes(rawPhase);
  const currentPhase: GameState['phase'] = isValidPhase ? rawPhase as GameState['phase'] : 'SETUP';
  const currentPhaseIdx = PHASE_ORDER.indexOf(currentPhase);
  const audienceUrl = `${origin}/audience`;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#09090b', color: '#fafafa' }}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20" style={{ backgroundColor: '#09090b', borderBottom: '1px solid #1f1f23' }}>
        <div className="px-6 lg:px-10 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="shrink-0">
              <h1 className="font-mono text-lg font-bold tracking-widest" style={{ color: '#f59e0b' }}>LIE HARD</h1>
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: '#3f3f46' }}>OPERATOR PANEL</p>
            </div>

            {/* Phase stepper */}
            <div className="flex items-center gap-0 overflow-x-auto flex-1 justify-center">
              {PHASE_ORDER.map((phase, i) => {
                const isPast = i < currentPhaseIdx;
                const isCurrent = i === currentPhaseIdx;
                const isFuture = i > currentPhaseIdx;
                return (
                  <div key={phase} className="flex items-center">
                    {isPast ? (
                      <button
                        onClick={() => db_update({ phase })}
                        className="font-mono text-sm px-3 py-1 rounded whitespace-nowrap transition-colors"
                        style={{ color: '#6b7280', backgroundColor: 'transparent', fontWeight: 400 }}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#d1d5db'; (e.target as HTMLElement).style.backgroundColor = '#1f1f23'; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.color = '#6b7280'; (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                      >
                        {PHASE_LABELS[phase]}
                      </button>
                    ) : (
                      <span
                        className="font-mono text-sm px-3 py-1 rounded transition-colors whitespace-nowrap"
                        style={{
                          backgroundColor: isCurrent ? '#f59e0b' : 'transparent',
                          color: isCurrent ? '#09090b' : '#27272a',
                          fontWeight: isCurrent ? 700 : 400,
                          cursor: isFuture ? 'default' : 'default',
                        }}
                      >
                        {isCurrent && '▶ '}{PHASE_LABELS[phase]}
                      </span>
                    )}
                    {i < PHASE_ORDER.length - 1 && (
                      <span className="font-mono text-sm mx-1" style={{ color: isPast ? '#374151' : '#1f1f23' }}>—</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live scores */}
            <div className="flex gap-2 shrink-0">
              {gameState.players.map((p) => (
                <div key={p.id} className="text-center px-4 py-2 rounded-lg" style={{ border: '1px solid #27272a', backgroundColor: '#111113' }}>
                  <p className="font-mono text-xs leading-none mb-1" style={{ color: '#71717a' }}>{p.name}</p>
                  <p className="font-mono text-xl font-bold leading-none" style={{ color: '#f59e0b' }}>{p.score}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body: scrollable content + fixed right panel */}
      <div className="flex">
        <main className="flex-1 min-w-0 px-6 lg:px-10 py-6">
          {/* Stale data warning */}
          {!isValidPhase && (
            <div className="mb-6 rounded-lg p-4" style={{ backgroundColor: '#1a1200', border: '1px solid #854d0e' }}>
              <p className="font-mono text-sm font-bold mb-1" style={{ color: '#fbbf24' }}>OLD GAME DATA DETECTED</p>
              <p className="font-mono text-sm mb-3" style={{ color: '#713f12' }}>Database has data from a previous version. Initialize to start fresh.</p>
              <button onClick={() => setDoc(doc(db, 'gameState', 'live'), initialGameState)}
                className="px-5 py-2.5 rounded font-mono text-sm font-bold transition-colors"
                style={{ backgroundColor: '#1c0000', color: '#f87171', border: '1px solid #7f1d1d' }}>
                INITIALIZE FRESH GAME STATE
              </button>
            </div>
          )}

          {/* Phase sections */}
          <SectionCard id="SETUP" title="SETUP" currentPhase={currentPhase} render={renderSetup} />
          <SectionCard id="WARMUP" title="WARMUP ROUND" currentPhase={currentPhase} render={renderWarmup} />
          <SectionCard id="SEGMENT1" title="SEGMENT 1 — TRUTH OR LIE" currentPhase={currentPhase} render={renderSeg1} />
          <SectionCard id="SEGMENT2" title="SEGMENT 2 — TWO STATEMENTS" currentPhase={currentPhase} render={renderSeg2} />
          <SectionCard id="SEGMENT3" title="SEGMENT 3 — WHO OWNS IT?" currentPhase={currentPhase} render={renderSeg3} />
          <SectionCard id="FINAL" title="FINAL" currentPhase={currentPhase} render={renderFinal} />

          {/* Upcoming phases */}
          {isValidPhase && PHASE_ORDER.slice(currentPhaseIdx + 1).map((phase) => (
            <div key={phase} className="mb-2 px-5 py-3 rounded-lg flex items-center justify-between"
              style={{ border: '1px solid #1f1f23', backgroundColor: '#0d0d0f' }}>
              <span className="font-mono text-xs uppercase tracking-widest" style={{ color: '#27272a' }}>UPCOMING</span>
              <span className="font-mono text-sm" style={{ color: '#27272a' }}>{PHASE_LABELS[phase]}</span>
            </div>
          ))}
        </main>

        {/* Fixed right panel */}
        {renderRightPanel()}
      </div>
    </div>
  );
}
