import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGameSocket } from "../hooks/useGameSocket";
import { useCountdown } from "../hooks/useCountdown";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex items-center justify-center gap-3 text-lg">
      <Clock className="w-5 h-5 text-white/40" />
      <span className="text-white/50">{label}</span>
      <span
        className={cn(
          "font-display font-bold text-3xl min-w-[3ch] text-center",
          secondsLeft <= 5
            ? "text-red-400 animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
            : "text-gold",
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
        <p className="font-display text-4xl text-white/60">
          All questions answered!
        </p>
        <p className="font-display text-6xl text-gold animate-[drumroll_0.6s_ease-in-out_infinite]">
          And the winner is…
        </p>
        <div className="flex gap-3 mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-5 h-5 rounded-full bg-gold animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 animate-[winner-reveal_0.6s_ease-out]">
      <Trophy className="w-24 h-24 text-gold drop-shadow-[0_0_50px_rgba(245,197,24,0.8)] animate-[pulse-gold_2s_ease-in-out_infinite]" />
      <h1 className="font-display text-7xl font-bold text-gold animate-[glow-text-gold_3s_ease-in-out_infinite]">
        {winnerName}
      </h1>
      <p className="font-display text-4xl text-white/60">${winnerScore}</p>
      <div className="flex gap-6 flex-wrap justify-center mt-8">
        {sorted.map(([connId, score], i) => {
          const player = players.find((p) => p.connId === connId);
          return (
            <div
              key={connId}
              className={cn(
                "flex flex-col items-center p-6 rounded-2xl border min-w-[140px]",
                i === 0
                  ? "border-gold bg-gold/20 shadow-[0_0_40px_rgba(245,197,24,0.3)]"
                  : "border-white/10 bg-surface",
              )}
            >
              <span className="text-4xl mb-2">
                {i === 0 ? "🏆" : `#${i + 1}`}
              </span>
              <span className="font-semibold text-lg text-white">
                {player?.playerName ?? connId}
              </span>
              <span
                className={cn(
                  "font-display text-3xl font-bold mt-1",
                  i === 0 ? "text-gold" : "text-white",
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
    <div className="min-h-screen bg-navy p-4">
      {state.isReconnecting && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-yellow-500/30 bg-yellow-900/80 text-yellow-300 px-6 py-3 text-sm flex items-center gap-2 backdrop-blur">
          <WifiOff className="w-4 h-4 shrink-0" />
          Reconnecting…
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}

      {/* Scoreboard — always visible */}
      {state.players.length > 0 && (
        <div className="flex gap-3 flex-wrap justify-center mb-6">
          {state.players.map((p) => (
            <div
              key={p.connId}
              className={cn(
                "flex items-center gap-3 px-5 py-3 rounded-xl border transition-all text-lg",
                state.buzzedPlayer?.playerId === p.connId
                  ? "border-gold bg-gold/20 shadow-[0_0_20px_rgba(245,197,24,0.4)]"
                  : state.failedBuzzPlayers.includes(p.connId)
                    ? "border-red-500/30 bg-red-900/10"
                    : "border-white/10 bg-surface",
              )}
            >
              <span className="font-semibold text-white">{p.playerName}</span>
              <span className="font-display font-bold text-gold">
                ${state.scores[p.connId] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Lobby */}
      {state.phase === "lobby" && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
          <p className="font-display text-5xl font-bold text-gold tracking-[0.3em] animate-[glow-text-gold_3s_ease-in-out_infinite]">
            {roomCode}
          </p>
          <p className="text-white/40 text-xl">
            {state.players.length} player
            {state.players.length !== 1 ? "s" : ""} joined
          </p>
          <Loader2 className="w-10 h-10 text-gold/40 animate-spin" />
        </div>
      )}

      {/* Board */}
      {state.phase === "active" && !state.activeQuestion && (
        <div className="overflow-x-auto rounded-xl border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <table
            className="w-full border-collapse"
            style={{ minWidth: `${state.board.length * 160}px` }}
          >
            <thead>
              <tr>
                {state.board.map((cat) => (
                  <th
                    key={cat.slug}
                    className="bg-board border-b-2 border-black/30 px-4 py-5 text-center"
                  >
                    <span className="font-display font-semibold text-lg text-white uppercase tracking-wider">
                      {cat.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VALUES.map((val) => (
                <tr key={val}>
                  {state.board.map((cat) => {
                    const key = `${cat.slug}#${val}`;
                    const used = state.usedQuestions.includes(key);
                    return (
                      <td
                        key={cat.slug}
                        className={cn(
                          "border border-black/40 text-center h-24",
                          used ? "bg-navy" : "bg-board",
                        )}
                      >
                        {!used && (
                          <span className="font-display font-bold text-3xl text-gold">
                            ${val}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Active question */}
      {state.phase === "active" && state.activeQuestion && (
        <div className="flex flex-col items-center text-center py-12 animate-[slide-up_0.3s_ease-out] max-w-4xl mx-auto">
          <Badge variant="board" className="mb-6 text-lg px-6 py-2">
            {state.activeQuestion.categoryName} &bull; $
            {state.activeQuestion.value}
          </Badge>
          <div className="rounded-2xl border border-white/10 bg-surface p-12 w-full mb-8">
            <p className="text-4xl font-semibold text-white leading-relaxed">
              {state.activeQuestion.clue}
            </p>
          </div>

          {/* Revealed answer (after host confirms) */}
          {state.revealedAnswer && (
            <div
              className={cn(
                "rounded-xl border px-8 py-4 mb-6 text-xl font-semibold",
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

          {state.buzzedPlayer ? (
            <div className="flex flex-col items-center gap-4">
              <div className="font-display text-3xl font-bold text-gold animate-[pulse-gold_2s_ease-in-out_infinite] rounded-2xl border border-gold/30 bg-gold/10 px-10 py-6">
                ⚡ {state.buzzedPlayer.playerName}
              </div>
              {state.buzzDeadline && (
                <TimerBar
                  secondsLeft={buzzSecondsLeft}
                  label="Time to answer"
                />
              )}
            </div>
          ) : isStealPhase ? (
            <div className="flex flex-col items-center gap-4">
              <div className="font-display text-2xl font-semibold text-yellow-400">
                Steal opportunity!
              </div>
              <TimerBar secondsLeft={stealSecondsLeft} label="Steal window" />
            </div>
          ) : !state.revealedAnswer ? (
            <p className="text-white/40 text-xl animate-pulse">
              Waiting for buzz…
            </p>
          ) : null}
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
          <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 animate-[slide-up_0.4s_ease-out]">
            <Trophy className="w-20 h-20 text-gold drop-shadow-[0_0_40px_rgba(245,197,24,0.6)]" />
            <h2 className="font-display text-6xl font-bold text-gold">
              Game Over!
            </h2>
            <div className="flex gap-6 flex-wrap justify-center mt-8">
              {Object.entries(state.finalScores)
                .sort(([, a], [, b]) => b - a)
                .map(([connId, score], i) => {
                  const player = state.players.find((p) => p.connId === connId);
                  return (
                    <div
                      key={connId}
                      className={cn(
                        "flex flex-col items-center p-6 rounded-2xl border min-w-[140px]",
                        i === 0
                          ? "border-gold bg-gold/20 shadow-[0_0_40px_rgba(245,197,24,0.3)]"
                          : "border-white/10 bg-surface",
                      )}
                    >
                      <span className="text-4xl mb-2">
                        {i === 0 ? "🏆" : `#${i + 1}`}
                      </span>
                      <span className="font-semibold text-lg text-white">
                        {player?.playerName ?? connId}
                      </span>
                      <span
                        className={cn(
                          "font-display text-3xl font-bold mt-1",
                          i === 0 ? "text-gold" : "text-white",
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
        <div className="flex items-center justify-center min-h-[80vh] text-white/40">
          <Loader2 className="w-8 h-8 animate-spin mr-3" />
          Connecting to room {roomCode}…
        </div>
      )}
    </div>
  );
}
