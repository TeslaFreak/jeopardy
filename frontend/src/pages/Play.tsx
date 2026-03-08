import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGameSocket } from "../hooks/useGameSocket";
import { useCountdown } from "../hooks/useCountdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Zap,
  Trophy,
  ChevronRight,
  Loader2,
  WifiOff,
  Clock,
} from "lucide-react";

type PlayerPhase =
  | "enter"
  | "lobby"
  | "active_board"
  | "active_question"
  | "buzzed"
  | "ended";

function WinnerRevealPlayer({
  finalScores,
  players,
  myName,
}: {
  finalScores: Record<string, number>;
  players: { connId: string; playerName: string }[];
  myName: string;
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
  const isMe = winnerPlayer?.playerName === myName;

  if (!revealed) {
    return (
      <div className="flex flex-col items-center py-16 gap-6 text-center">
        <p className="font-display text-2xl text-white/60">
          All questions answered!
        </p>
        <p className="font-display text-4xl text-gold animate-[drumroll_0.6s_ease-in-out_infinite]">
          And the winner is…
        </p>
        <div className="flex gap-2 mt-4">
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
    <div className="flex flex-col items-center py-12 animate-[winner-reveal_0.6s_ease-out] text-center">
      <Trophy className="w-16 h-16 text-gold mb-4 drop-shadow-[0_0_30px_rgba(245,197,24,0.6)] animate-[pulse-gold_2s_ease-in-out_infinite]" />
      <h2 className="font-display text-4xl font-bold text-gold mb-1 animate-[glow-text-gold_3s_ease-in-out_infinite]">
        {isMe ? "YOU WIN!" : winnerName}
      </h2>
      <p className="font-display text-xl text-white/50 mb-10">${winnerScore}</p>
      <div className="flex gap-4 flex-wrap justify-center mb-10">
        {sorted.map(([connId, score], i) => {
          const p = players.find((pl) => pl.connId === connId);
          return (
            <div
              key={connId}
              className={cn(
                "flex flex-col items-center p-5 rounded-2xl border min-w-[110px]",
                p?.playerName === myName ? "ring-2 ring-gold/50" : "",
                i === 0
                  ? "border-gold bg-gold/20 shadow-[0_0_30px_rgba(245,197,24,0.3)]"
                  : "border-white/10 bg-surface",
              )}
            >
              <span className="text-3xl mb-1">
                {i === 0 ? "🏆" : `#${i + 1}`}
              </span>
              <span className="font-semibold text-white">
                {p?.playerName ?? connId}
              </span>
              <span
                className={cn(
                  "font-display text-2xl font-bold mt-1",
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

export default function Play() {
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState(searchParams.get("room") ?? "");
  const [playerName, setPlayerName] = useState("");
  const [localPhase, setLocalPhase] = useState<PlayerPhase>("enter");
  const [myName, setMyName] = useState("");
  const { state, connect, sendMessage } = useGameSocket();
  const navigate = useNavigate();

  const { secondsLeft: buzzSecondsLeft } = useCountdown(state.buzzDeadline);
  const { secondsLeft: stealSecondsLeft } = useCountdown(state.stealDeadline);

  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!roomCode.trim() || !playerName.trim()) return;
    const code = roomCode.trim().toUpperCase();
    const name = playerName.trim();
    setMyName(name);
    connect(code, name, false, "player");
    setLocalPhase("lobby");
  }

  // Find my connId from the players list
  const myConnId = state.players.find((p) => p.playerName === myName)?.connId;
  const iFailedBuzz = myConnId
    ? state.failedBuzzPlayers.includes(myConnId)
    : false;

  const isStealPhase =
    state.stealDeadline !== null && !state.buzzedPlayer && state.activeQuestion;

  const gamePhase = state.phase;
  const effectivePhase: PlayerPhase = (() => {
    if (localPhase === "enter") return "enter";
    if (gamePhase === "ended") return "ended";
    if (gamePhase === "active") {
      if (state.activeQuestion) {
        if (state.buzzedPlayer) return "buzzed";
        return "active_question";
      }
      return "active_board";
    }
    return "lobby";
  })();

  useEffect(() => {
    const param = searchParams.get("room");
    if (param) setRoomCode(param.toUpperCase());
  }, [searchParams]);

  // Reset to enter phase when connection is rejected (e.g. room not found)
  useEffect(() => {
    if (state.error && state.phase === "idle" && localPhase !== "enter") {
      setLocalPhase("enter");
    }
  }, [state.error, state.phase, localPhase]);

  function buzzIn() {
    sendMessage("BUZZ_IN", {});
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (effectivePhase === "enter") {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm animate-[slide-up_0.4s_ease-out]">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-board/20 border border-board/40 mb-4">
              <Zap className="w-8 h-8 text-gold" />
            </div>
            <h1 className="font-display text-4xl font-bold text-gold tracking-wider">
              JOIN GAME
            </h1>
            <p className="text-white/50 mt-2 text-sm">
              Enter the room code and your name
            </p>
          </div>

          {state.error && (
            <div className="rounded-xl border border-red-500/30 bg-red-900/20 text-red-300 px-4 py-3 mb-4 text-sm text-center">
              {state.error}
            </div>
          )}

          <form onSubmit={joinRoom} className="flex flex-col gap-4">
            <Input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              className="text-center text-3xl font-display tracking-[0.4em] font-bold uppercase h-16 bg-navy-3 border-gold/20 focus:border-gold/60"
            />
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              className="h-12"
            />
            <Button
              type="submit"
              variant="gold"
              size="xl"
              disabled={!roomCode.trim() || !playerName.trim()}
              className="w-full"
            >
              Join Game <ChevronRight className="w-5 h-5" />
            </Button>
          </form>
          <p className="text-center text-white/30 text-xs mt-4">
            No account needed to play
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {state.isReconnecting && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-900/20 text-yellow-300 px-4 py-3 mb-4 text-sm flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Connection lost — reconnecting automatically…</span>
          <Loader2 className="w-4 h-4 animate-spin ml-auto shrink-0" />
        </div>
      )}
      {!state.isReconnecting && state.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 text-red-300 px-4 py-3 mb-4 text-sm">
          {state.error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <p className="font-semibold text-white">{myName}</p>
        </div>
        <Badge
          variant="default"
          className="font-display text-sm tracking-widest px-3 py-1"
        >
          {state.roomCode}
        </Badge>
      </div>

      {/* Scores */}
      {state.players.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {state.players.map((p) => (
            <div
              key={p.connId}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all",
                p.playerName === myName
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : state.buzzedPlayer?.playerId === p.connId
                    ? "border-gold bg-gold/20 text-gold shadow-[0_0_12px_rgba(245,197,24,0.4)]"
                    : state.failedBuzzPlayers.includes(p.connId)
                      ? "border-red-500/30 bg-red-900/10 text-red-300"
                      : "border-white/10 bg-surface text-white",
              )}
            >
              <span className="font-medium">{p.playerName}</span>
              <span className="font-display font-bold">
                ${state.scores[p.connId] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Lobby */}
      {effectivePhase === "lobby" && (
        <div className="flex flex-col items-center py-20 gap-4 text-center">
          <Loader2 className="w-10 h-10 text-gold/60 animate-spin" />
          <p className="font-display text-xl text-white/60">
            Waiting for host to start…
          </p>
          <p className="text-white/30 text-sm">
            {state.players.length} player{state.players.length !== 1 ? "s" : ""}{" "}
            in lobby
          </p>
        </div>
      )}

      {/* Board — host is picking */}
      {effectivePhase === "active_board" && (
        <div className="flex flex-col items-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-full border-2 border-gold/30 flex items-center justify-center">
            <span className="text-3xl">👀</span>
          </div>
          <p className="font-display text-xl text-white/60">
            Host is picking a question…
          </p>
        </div>
      )}

      {/* Active Question */}
      {(effectivePhase === "active_question" || effectivePhase === "buzzed") &&
        state.activeQuestion && (
          <div className="flex flex-col items-center animate-[slide-up_0.3s_ease-out]">
            <Badge variant="board" className="mb-4 text-sm px-4 py-1.5">
              {state.activeQuestion.categoryName} &bull; $
              {state.activeQuestion.value}
            </Badge>
            <div className="rounded-2xl border border-white/10 bg-surface px-8 py-10 text-center mb-8 w-full">
              <p className="text-2xl font-semibold text-white leading-relaxed">
                {state.activeQuestion.clue}
              </p>
            </div>

            {/* Revealed answer (broadcast after host confirms/timer expires) */}
            {state.revealedAnswer && (
              <div
                className={cn(
                  "w-full rounded-xl border px-6 py-3 mb-4 text-sm text-center",
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

            {effectivePhase === "buzzed" && state.buzzedPlayer ? (
              <div className="w-full flex flex-col items-center gap-3">
                <div
                  className={cn(
                    "w-full rounded-2xl border p-6 text-center font-display text-2xl font-bold",
                    state.buzzedPlayer.playerName === myName
                      ? "border-gold bg-gold/20 text-gold shadow-[0_0_40px_rgba(245,197,24,0.4)]"
                      : "border-white/10 bg-surface text-white",
                  )}
                >
                  {state.buzzedPlayer.playerName === myName
                    ? "⚡ YOU buzzed in! Answer the host."
                    : `${state.buzzedPlayer.playerName} buzzed in!`}
                </div>
                {state.buzzDeadline && buzzSecondsLeft !== null && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-white/40" />
                    <span
                      className={cn(
                        "font-display font-bold text-lg",
                        buzzSecondsLeft <= 5
                          ? "text-red-400 animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
                          : "text-gold",
                      )}
                    >
                      {buzzSecondsLeft}s
                    </span>
                  </div>
                )}
              </div>
            ) : isStealPhase ? (
              <div className="w-full flex flex-col items-center gap-4">
                <p className="font-display text-lg font-semibold text-yellow-400">
                  Steal opportunity!
                </p>
                {stealSecondsLeft !== null && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-white/40" />
                    <span
                      className={cn(
                        "font-display font-bold text-lg",
                        stealSecondsLeft <= 5
                          ? "text-red-400 animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
                          : "text-gold",
                      )}
                    >
                      {stealSecondsLeft}s
                    </span>
                  </div>
                )}
                {iFailedBuzz ? (
                  <div className="w-full rounded-2xl border border-red-500/20 bg-red-900/10 p-6 text-center">
                    <p className="font-display text-xl text-red-400">
                      You already answered wrong
                    </p>
                    <p className="text-white/40 text-sm mt-1">
                      Can&apos;t buzz again on this question
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={buzzIn}
                    className="w-full rounded-2xl bg-yellow-600 hover:bg-yellow-500 active:scale-95 text-white font-display text-3xl font-bold py-6 shadow-[0_4px_30px_rgba(202,138,4,0.5)] hover:shadow-[0_4px_40px_rgba(202,138,4,0.7)] transition-all duration-150"
                  >
                    STEAL!
                  </button>
                )}
              </div>
            ) : !state.revealedAnswer ? (
              <button
                onClick={buzzIn}
                className="w-full rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-display text-4xl font-bold py-8 shadow-[0_4px_30px_rgba(220,38,38,0.5)] hover:shadow-[0_4px_40px_rgba(220,38,38,0.7)] transition-all duration-150 animate-[buzz_0.3s_ease-in-out]"
              >
                BUZZ IN!
              </button>
            ) : null}
          </div>
        )}

      {/* Ended */}
      {effectivePhase === "ended" &&
        (state.isAllQuestionsComplete && state.finalScores ? (
          <WinnerRevealPlayer
            finalScores={state.finalScores}
            players={state.players}
            myName={myName}
          />
        ) : (
          <div className="flex flex-col items-center py-12 animate-[slide-up_0.4s_ease-out] text-center">
            <Trophy className="w-16 h-16 text-gold mb-4 drop-shadow-[0_0_30px_rgba(245,197,24,0.6)]" />
            <h2 className="font-display text-4xl font-bold text-gold mb-2">
              Game Over!
            </h2>
            <p className="text-white/50 mb-10">Final Scores</p>
            <div className="flex gap-4 flex-wrap justify-center mb-10">
              {Object.entries(state.finalScores ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([connId, score], i) => {
                  const p = state.players.find((pl) => pl.connId === connId);
                  return (
                    <div
                      key={connId}
                      className={cn(
                        "flex flex-col items-center p-5 rounded-2xl border min-w-[110px]",
                        p?.playerName === myName ? "ring-2 ring-gold/50" : "",
                        i === 0
                          ? "border-gold bg-gold/20 shadow-[0_0_30px_rgba(245,197,24,0.3)]"
                          : "border-white/10 bg-surface",
                      )}
                    >
                      <span className="text-3xl mb-1">
                        {i === 0 ? "🏆" : `#${i + 1}`}
                      </span>
                      <span className="font-semibold text-white">
                        {p?.playerName ?? connId}
                      </span>
                      <span
                        className={cn(
                          "font-display text-2xl font-bold mt-1",
                          i === 0 ? "text-gold" : "text-white",
                        )}
                      >
                        ${score}
                      </span>
                    </div>
                  );
                })}
            </div>
            <Button variant="gold" size="lg" onClick={() => navigate("/")}>
              Play Again
            </Button>
          </div>
        ))}
    </div>
  );
}
