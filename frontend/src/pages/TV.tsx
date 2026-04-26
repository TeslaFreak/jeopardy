import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGameSocket } from "../hooks/useGameSocket";
import { useCountdown } from "../hooks/useCountdown";

import { cn } from "@/lib/utils";
import { Trophy, Loader2, WifiOff, Clock } from "lucide-react";

const VALUES = [100, 200, 300, 400, 500];

function TimerBar({
  secondsLeft,
  label,
}: {
  secondsLeft: number | null;
  label: string;
}) {
  if (secondsLeft === null) return null;
  return (
    <div className="flex items-center justify-center gap-3 text-lg font-display">
      <Clock className="w-5 h-5 text-on-surface-variant" />
      <span className="text-on-surface-variant uppercase tracking-widest text-xs font-bold">
        {label}
      </span>
      <span
        className={cn(
          "font-black text-3xl min-w-[3ch] text-center",
          secondsLeft <= 5
            ? "text-red-400 animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
            : "text-gold drop-shadow-glow",
        )}
      >
        {secondsLeft}s
      </span>
    </div>
  );
}

function WinnerRevealTV({
  finalScores,
  players,
}: {
  finalScores: Record<string, number>;
  players: { connId: string; playerName: string }[];
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const sorted = Object.entries(finalScores).sort(([, a], [, b]) => b - a);
  const winnerConnId = sorted[0]?.[0];
  const winnerPlayer = players.find((p) => p.connId === winnerConnId);
  const winnerName = winnerPlayer?.playerName ?? winnerConnId;
  const winnerScore = sorted[0]?.[1] ?? 0;

  if (!revealed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-8">
        <p className="font-display text-4xl text-on-surface-variant">
          All questions answered!
        </p>
        <p className="font-display text-6xl font-black italic text-gold animate-[drumroll_0.6s_ease-in-out_infinite] drop-shadow-[0_0_30px_rgba(255,254,172,0.5)]">
          And the winner is…
        </p>
        <div className="flex gap-3 mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full bg-gold animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 animate-[winner-reveal_0.6s_ease-out] px-6">
      <Trophy className="w-24 h-24 text-gold drop-shadow-[0_0_50px_rgba(255,254,172,0.8)] animate-[pulse-gold_2s_ease-in-out_infinite]" />
      <h1 className="font-display text-7xl font-black italic uppercase tracking-tight text-gold animate-[glow-text-gold_3s_ease-in-out_infinite] drop-shadow-[0_0_40px_rgba(255,254,172,0.5)]">
        {winnerName}
      </h1>
      <p className="font-display text-4xl font-bold text-on-surface-variant">
        ${winnerScore}
      </p>
      <div className="flex gap-4 flex-wrap justify-center mt-8">
        {sorted.map(([connId, score], i) => {
          const player = players.find((p) => p.connId === connId);
          return (
            <div
              key={connId}
              className={cn(
                "flex flex-col items-center p-6 rounded-2xl border min-w-[140px] backdrop-blur-md",
                i === 0
                  ? "border-gold/40 bg-[#291543] shadow-[0_0_40px_rgba(255,254,172,0.15)]"
                  : "border-outline-variant/20 bg-[#22103a]",
              )}
            >
              <span className="text-4xl mb-2">
                {i === 0 ? "🏆" : `#${i + 1}`}
              </span>
              <span className="font-display font-bold text-lg text-on-surface">
                {player?.playerName ?? connId}
              </span>
              <span
                className={cn(
                  "font-display text-3xl font-black mt-1",
                  i === 0
                    ? "text-gold drop-shadow-glow"
                    : "text-on-surface-variant",
                )}
              >
                ${score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TV() {
  const [searchParams] = useSearchParams();
  const roomCode = searchParams.get("room");
  const { state, connect } = useGameSocket();

  const { secondsLeft: buzzSecondsLeft } = useCountdown(state.buzzDeadline);
  const { secondsLeft: stealSecondsLeft } = useCountdown(state.stealDeadline);

  useEffect(() => {
    if (roomCode) {
      connect(roomCode, "__tv__", false, "tv");
    }
  }, [roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!roomCode) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white/40 text-2xl">
        No room code provided
      </div>
    );
  }

  const isStealPhase =
    state.stealDeadline !== null && !state.buzzedPlayer && state.activeQuestion;

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-navy">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] bg-tertiary/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-gold/5 rounded-full blur-[120px]" />
      </div>

      {state.isReconnecting && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full border border-yellow-500/30 bg-yellow-900/80 text-yellow-300 px-6 py-3 text-sm flex items-center gap-2 backdrop-blur">
          <WifiOff className="w-4 h-4 shrink-0" />
          Reconnecting…
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}

      {/* Header — room code top-left, brand top-right */}
      <header className="relative z-10 shrink-0 flex items-center justify-between px-6 py-3">
        <div className="bg-[#22103a] border border-outline-variant/20 px-4 py-1.5 rounded-full flex items-center gap-2">
          <span className="text-[10px] font-bold text-secondary tracking-widest uppercase">
            ROOM
          </span>
          <span className="font-display font-black text-sm text-gold tracking-widest">
            {roomCode}
          </span>
        </div>
        <span className="font-display font-black italic text-gold text-xl uppercase tracking-tight drop-shadow-glow">
          JEOPARDY!
        </span>
      </header>

      {/* Scoreboard strip — always rendered, player cards */}
      {state.players.length > 0 && (
        <section className="relative z-10 shrink-0 flex flex-wrap justify-center gap-3 px-6 pb-3">
          {state.players.map((p, i) => {
            const ROTATIONS = [
              "-rotate-1",
              "rotate-1",
              "-rotate-2",
              "rotate-2",
              "rotate-1",
              "-rotate-1",
            ];
            const score = state.scores[p.connId] ?? 0;
            const isBuzzed = state.buzzedPlayer?.playerId === p.connId;
            const isFailed = state.failedBuzzPlayers.includes(p.connId);
            return (
              <div
                key={p.connId}
                className={cn(
                  "bg-[#291543]/60 backdrop-blur-md px-6 py-3 rounded-xl border flex items-center gap-4 transition-all",
                  ROTATIONS[i % ROTATIONS.length],
                  isBuzzed
                    ? "border-gold/40 shadow-[0_0_30px_rgba(255,254,172,0.1)]"
                    : isFailed
                      ? "border-red-500/20"
                      : "border-outline-variant/20",
                )}
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-tighter text-on-surface-variant leading-none mb-0.5">
                    {p.playerName}
                  </p>
                  <p
                    className={cn(
                      "font-display text-2xl font-black tracking-tighter",
                      isBuzzed
                        ? "text-gold drop-shadow-glow"
                        : isFailed
                          ? "text-red-400"
                          : score < 0
                            ? "text-red-400"
                            : "text-gold",
                    )}
                  >
                    {score < 0
                      ? `-$${Math.abs(score).toLocaleString()}`
                      : `$${score.toLocaleString()}`}
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Lobby */}
      {state.phase === "lobby" && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-10">
          <p className="font-display font-black italic text-7xl uppercase tracking-tight text-gold drop-shadow-[0_0_40px_rgba(255,254,172,0.5)] animate-[glow-text-gold_3s_ease-in-out_infinite]">
            JEOPARDY!
          </p>
          {/* Room code */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-linear-to-r from-secondary via-gold to-tertiary rounded-2xl blur opacity-30" />
            <div className="relative bg-[#22103a] border border-outline-variant/20 px-10 py-6 rounded-2xl flex flex-col items-center neon-border-glow">
              <span className="text-outline text-xs font-display font-bold uppercase tracking-widest mb-3">
                Room Code
              </span>
              <div className="flex gap-4">
                {(roomCode ?? "").split("").map((ch, i) => (
                  <span
                    key={i}
                    className="font-display text-8xl font-black text-gold tracking-tighter drop-shadow-glow"
                  >
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="text-on-surface-variant text-lg font-display font-bold uppercase tracking-widest">
            {state.players.length} player{state.players.length !== 1 ? "s" : ""}{" "}
            joined
          </p>
          <Loader2 className="w-10 h-10 text-secondary/40 animate-spin" />
        </div>
      )}

      {/* Board */}
      {state.phase === "active" && !state.activeQuestion && (
        <div className="relative z-10 flex-1 min-h-0 flex gap-14 px-28 pb-28 pt-4">
          {state.board.map((cat, i) => {
            const TILTS = [
              "-rotate-2",
              "rotate-1",
              "-rotate-1",
              "rotate-2",
              "rotate-1",
              "-rotate-2",
            ];
            return (
              <div key={cat.slug} className="flex-1 flex flex-col gap-3">
                {/* Category header */}
                <div
                  className={cn(
                    "shrink-0 h-24 flex items-center justify-center text-center px-3 py-2 bg-[#301a4d] rounded-[2rem] shadow-lg mb-1",
                    TILTS[i % TILTS.length],
                  )}
                >
                  <h3 className="font-display font-extrabold text-xs md:text-sm text-gold uppercase leading-tight tracking-tight">
                    {cat.name}
                  </h3>
                </div>
                {/* Value tiles */}
                {VALUES.map((val) => {
                  const key = `${cat.slug}#${val}`;
                  const used = state.usedQuestions.includes(key);
                  return (
                    <div
                      key={val}
                      className={cn(
                        "flex-1 rounded-[2.5rem] flex items-center justify-center relative overflow-hidden transition-all",
                        used
                          ? "bg-[#1b0a31] border border-outline-variant/10 opacity-30"
                          : "bg-[#291543] border border-secondary/10 neon-border-glow",
                      )}
                    >
                      {!used && (
                        <>
                          <div className="absolute inset-0 glossy-overlay" />
                          <span className="font-display font-black text-2xl md:text-3xl text-secondary drop-shadow-[0_0_10px_rgba(0,227,253,0.5)]">
                            ${val}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Active question — Clue View */}
      {state.phase === "active" && state.activeQuestion && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 animate-[slide-up_0.3s_ease-out]">
          {/* Ambient glow behind card */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gold/5 blur-[120px] rounded-full pointer-events-none" />

          {/* Category pill */}
          <div className="mb-8 text-center">
            <span className="font-display font-extrabold text-tertiary tracking-[0.2em] text-xs uppercase mb-2 block">
              CATEGORY
            </span>
            <div className="inline-block px-6 py-2 bg-[#301a4d]/60 backdrop-blur-md rounded-lg -rotate-1 border-b-4 border-tertiary">
              <h2 className="font-display font-bold text-on-surface text-xl md:text-2xl tracking-tight uppercase">
                {state.activeQuestion.categoryName}
              </h2>
            </div>
          </div>

          {/* Clue card */}
          <div className="relative w-full max-w-5xl">
            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-gold/50 rounded-tl-2xl" />
            <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-gold/50 rounded-br-2xl" />
            {/* Value badge */}
            <div className="absolute -top-5 -right-5 bg-gold text-navy font-display font-black text-2xl px-6 py-2 rounded-full rotate-6 shadow-xl z-10">
              ${state.activeQuestion.value}
            </div>
            <div className="bg-[#291543]/60 backdrop-blur-2xl rounded-2xl p-10 md:p-16 text-center border border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
              <p className="font-display font-extrabold text-3xl md:text-5xl lg:text-6xl leading-tight text-white drop-shadow-[0_2px_15px_rgba(255,255,255,0.2)]">
                {state.activeQuestion.clue}
              </p>
            </div>
          </div>

          {/* Revealed answer */}
          {state.revealedAnswer && (
            <div
              className={cn(
                "mt-6 rounded-xl border px-8 py-4 text-xl font-semibold backdrop-blur",
                state.revealedAnswer.wasCorrect
                  ? "border-emerald-500/30 bg-emerald-900/20 text-emerald-300"
                  : "border-red-500/30 bg-red-900/20 text-red-300",
              )}
            >
              {state.revealedAnswer.wasCorrect
                ? `✓ ${state.revealedAnswer.correctPlayerName} got it right!`
                : "✗ Nobody got it right."}
              {" — "}
              {state.revealedAnswer.answer}
            </div>
          )}

          {/* Buzz / steal / waiting */}
          <div className="mt-8 flex flex-col items-center gap-4 w-full max-w-xl">
            {state.buzzedPlayer ? (
              <>
                <div className="font-display text-3xl font-bold text-gold animate-[pulse-gold_2s_ease-in-out_infinite] rounded-2xl border border-gold/30 bg-gold/10 px-10 py-6 text-center w-full">
                  ⚡ {state.buzzedPlayer.playerName}
                </div>
                {state.buzzDeadline && (
                  <TimerBar
                    secondsLeft={buzzSecondsLeft}
                    label="Time to answer"
                  />
                )}
              </>
            ) : isStealPhase ? (
              <>
                <div className="font-display text-2xl font-semibold text-yellow-400">
                  Steal opportunity!
                </div>
                <TimerBar secondsLeft={stealSecondsLeft} label="Steal window" />
              </>
            ) : !state.revealedAnswer ? (
              <>
                {/* Voltage timer bar */}
                {buzzSecondsLeft !== null && (
                  <div className="w-full flex flex-col gap-2 mt-4">
                    <div className="flex justify-between font-display font-bold text-secondary text-sm tracking-widest uppercase px-1">
                      <span>VOLTAGE DEPLETING</span>
                      <span>{String(buzzSecondsLeft).padStart(2, "0")}s</span>
                    </div>
                    <div className="w-full h-4 bg-[#301a4d] rounded-full p-1 relative overflow-hidden shadow-[0_0_20px_rgba(0,227,253,0.2)]">
                      <div
                        className="h-full bg-linear-to-r from-secondary to-secondary rounded-full transition-all relative"
                        style={{ width: "75%" }}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full blur-[2px] shadow-[0_0_8px_white]" />
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-on-surface-variant text-xl animate-pulse font-display tracking-wider uppercase text-sm">
                  Waiting for buzz…
                </p>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Ended */}
      {state.phase === "ended" &&
        state.finalScores &&
        (state.isAllQuestionsComplete ? (
          <WinnerRevealTV
            finalScores={state.finalScores}
            players={state.players}
          />
        ) : (
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 animate-[slide-up_0.4s_ease-out] px-6">
            <Trophy className="w-20 h-20 text-gold drop-shadow-[0_0_40px_rgba(255,254,172,0.6)] animate-[pulse-gold_2s_ease-in-out_infinite]" />
            <h2 className="font-display text-6xl font-black italic uppercase tracking-tight text-gold drop-shadow-[0_0_30px_rgba(255,254,172,0.4)]">
              Game Over!
            </h2>
            <div className="flex gap-4 flex-wrap justify-center mt-8">
              {Object.entries(state.finalScores)
                .sort(([, a], [, b]) => b - a)
                .map(([connId, score], i) => {
                  const player = state.players.find((p) => p.connId === connId);
                  return (
                    <div
                      key={connId}
                      className={cn(
                        "flex flex-col items-center p-6 rounded-2xl border min-w-[140px] backdrop-blur-md",
                        i === 0
                          ? "border-gold/40 bg-[#291543] shadow-[0_0_40px_rgba(255,254,172,0.15)]"
                          : "border-outline-variant/20 bg-[#22103a]",
                      )}
                    >
                      <span className="text-4xl mb-2">
                        {i === 0 ? "🏆" : `#${i + 1}`}
                      </span>
                      <span className="font-display font-bold text-lg text-on-surface">
                        {player?.playerName ?? connId}
                      </span>
                      <span
                        className={cn(
                          "font-display text-3xl font-black mt-1",
                          i === 0
                            ? "text-gold drop-shadow-glow"
                            : "text-on-surface-variant",
                        )}
                      >
                        ${score}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}

      {/* Idle — waiting for connection */}
      {state.phase === "idle" && (
        <div className="relative z-10 flex-1 flex items-center justify-center text-on-surface-variant font-display uppercase tracking-widest text-sm gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-secondary/60" />
          Connecting to room {roomCode}…
        </div>
      )}
    </div>
  );
}
