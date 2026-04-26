import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGameSocket } from "../hooks/useGameSocket";
import { useCountdown } from "../hooks/useCountdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";
import { Trophy, ChevronRight, Loader2, WifiOff, Clock } from "lucide-react";

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
        <p className="font-display font-bold uppercase tracking-widest text-on-surface-variant text-sm">
          All questions answered!
        </p>
        <p className="font-display text-4xl font-black italic text-gold animate-[drumroll_0.6s_ease-in-out_infinite] drop-shadow-glow">
          And the winner is…
        </p>
        <div className="flex gap-2 mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full bg-gold animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-12 animate-[winner-reveal_0.6s_ease-out] text-center">
      <Trophy className="w-16 h-16 text-gold mb-4 drop-shadow-[0_0_30px_rgba(255,254,172,0.6)] animate-[pulse-gold_2s_ease-in-out_infinite]" />
      <h2 className="font-display text-4xl font-black italic uppercase tracking-tight text-gold mb-1 animate-[glow-text-gold_3s_ease-in-out_infinite]">
        {isMe ? "YOU WIN!" : winnerName}
      </h2>
      <p className="font-display font-bold text-on-surface-variant mb-10">
        ${winnerScore}
      </p>
      <div className="flex gap-3 flex-wrap justify-center mb-10">
        {sorted.map(([connId, score], i) => {
          const p = players.find((pl) => pl.connId === connId);
          return (
            <div
              key={connId}
              className={cn(
                "flex flex-col items-center p-5 rounded-2xl border min-w-[110px] backdrop-blur-md",
                p?.playerName === myName ? "ring-2 ring-gold/30" : "",
                i === 0
                  ? "border-gold/40 bg-[#291543] shadow-[0_0_30px_rgba(255,254,172,0.15)]"
                  : "border-outline-variant/20 bg-[#22103a]",
              )}
            >
              <span className="text-3xl mb-1">
                {i === 0 ? "🏆" : `#${i + 1}`}
              </span>
              <span className="font-display font-bold text-on-surface">
                {p?.playerName ?? connId}
              </span>
              <span
                className={cn(
                  "font-display text-2xl font-black mt-1",
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
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 relative overflow-hidden">
        {/* Ambient blobs */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-secondary/5 blur-[100px]" />
          <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-tertiary/5 blur-[100px]" />
        </div>

        <div className="w-full max-w-sm animate-[slide-up_0.4s_ease-out]">
          <div className="text-center mb-8">
            <p className="font-display text-secondary text-xs font-bold uppercase tracking-[0.3em] mb-2">
              JOIN THE SHOW
            </p>
            <h1 className="font-display text-5xl font-black italic tracking-tighter text-gold drop-shadow-[0_0_30px_rgba(255,254,172,0.4)]">
              JEOPARDY!
            </h1>
            <p className="text-outline mt-2 text-sm">
              Enter the room code and your name
            </p>
          </div>

          {state.error && (
            <div className="rounded-xl border border-red-500/30 bg-red-900/20 text-red-300 px-4 py-3 mb-4 text-sm text-center">
              {state.error}
            </div>
          )}

          <form onSubmit={joinRoom} className="flex flex-col gap-3">
            <div className="group relative rounded-2xl border border-outline-variant/30 bg-navy-3 px-4 py-2 neon-border-glow">
              <Input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={6}
                className="text-center text-3xl font-display tracking-[0.4em] font-bold uppercase h-14 bg-transparent border-none shadow-none focus-visible:ring-0 text-gold placeholder:text-outline/40"
              />
            </div>
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              className="h-12 bg-navy-3 border-outline-variant/30 focus:border-secondary/50 focus:ring-secondary/20 placeholder:text-outline/40"
            />
            <Button
              type="submit"
              variant="gold"
              size="xl"
              disabled={!roomCode.trim() || !playerName.trim()}
              className="w-full font-display font-black uppercase tracking-wider rounded-full"
            >
              Join Game <ChevronRight className="w-5 h-5" />
            </Button>
          </form>
          <p className="text-center text-outline/50 text-xs mt-4 tracking-widest uppercase">
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
          <p className="font-display font-bold uppercase tracking-wider text-gold">
            {myName}
          </p>
        </div>
        <span className="font-display text-xs font-bold tracking-widest uppercase bg-navy-2 border border-outline-variant/30 text-gold px-3 py-1 rounded-full">
          ROOM: {state.roomCode}
        </span>
      </div>

      {/* Scores */}
      {state.players.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {state.players.map((p) => (
            <div
              key={p.connId}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all font-display font-bold uppercase tracking-wide",
                p.playerName === myName
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : state.buzzedPlayer?.playerId === p.connId
                    ? "border-secondary/60 bg-secondary/10 text-secondary shadow-[0_0_12px_rgba(0,227,253,0.3)]"
                    : state.failedBuzzPlayers.includes(p.connId)
                      ? "border-red-500/30 bg-red-900/10 text-red-300"
                      : "border-outline-variant/30 bg-navy-3 text-on-surface",
              )}
            >
              <span>{p.playerName}</span>
              <span className="text-xs opacity-70">
                ${state.scores[p.connId] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Lobby */}
      {effectivePhase === "lobby" && (
        <div className="flex flex-col items-center gap-8 py-8">
          {/* Room code centerpiece */}
          <div className="relative group w-full">
            <div className="absolute -inset-1 bg-linear-to-r from-secondary via-gold to-tertiary rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000" />
            <div className="relative bg-navy-3 border border-outline-variant/20 px-8 py-6 rounded-2xl flex flex-col items-center neon-border-glow">
              <span className="text-outline text-xs font-display font-bold uppercase tracking-widest mb-2">
                Room Code
              </span>
              <div className="flex gap-3">
                {(state.roomCode || "").split("").map((ch, i) => (
                  <span
                    key={i}
                    className="font-display text-6xl font-black text-gold tracking-tighter drop-shadow-glow"
                  >
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Player bento grid */}
          {state.players.length > 0 && (
            <div className="w-full grid grid-cols-3 sm:grid-cols-4 gap-3">
              {state.players.map((p, i) => {
                const ICONS = ["🚀", "🐱", "🤖", "🎉", "💀", "⚡", "🌟", "🔥"];
                const ROTATIONS = [
                  "-rotate-2",
                  "rotate-3",
                  "-rotate-1",
                  "rotate-6",
                  "-rotate-3",
                  "rotate-1",
                  "-rotate-2",
                  "rotate-2",
                ];
                const AVATAR_BG = [
                  "bg-[#006875]",
                  "bg-[#ff067f]/80",
                  "bg-surface-bright",
                  "bg-gold/20 border-2 border-gold/40",
                  "bg-red-900",
                  "bg-secondary/20",
                  "bg-surface-2",
                  "bg-[#291543]",
                ];
                return (
                  <div
                    key={p.connId}
                    className={cn(
                      "flex flex-col items-center transition-all duration-300 hover:rotate-0",
                      ROTATIONS[i % ROTATIONS.length],
                      p.playerName === myName ? "scale-110" : "",
                    )}
                  >
                    <div
                      className={cn(
                        "w-16 h-16 rounded-xl flex items-center justify-center shadow-lg mb-2 relative overflow-hidden",
                        AVATAR_BG[i % AVATAR_BG.length],
                      )}
                    >
                      <div className="absolute inset-0 glass-dome" />
                      <span className="text-3xl relative z-10">
                        {ICONS[i % ICONS.length]}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "font-display font-bold text-[10px] uppercase px-2 py-0.5 rounded-full shadow-sm",
                        p.playerName === myName
                          ? "bg-gold text-navy"
                          : "bg-surface-bright text-on-surface",
                      )}
                    >
                      {p.playerName}
                    </span>
                  </div>
                );
              })}
              {/* Waiting slot */}
              <div className="flex flex-col items-center opacity-40">
                <div className="w-16 h-16 border-2 border-dashed border-outline-variant/60 rounded-xl flex items-center justify-center mb-2">
                  <span className="text-outline text-2xl">+</span>
                </div>
                <span className="font-display font-bold text-[10px] uppercase text-outline">
                  Waiting...
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 text-center">
            <Loader2 className="w-4 h-4 text-secondary/60 animate-spin" />
            <p className="font-display text-sm font-bold uppercase tracking-wider text-outline">
              Waiting for host to start…
            </p>
          </div>
        </div>
      )}

      {/* Board — host is picking */}
      {effectivePhase === "active_board" && (
        <div className="flex flex-col items-center py-20 gap-6 text-center">
          <div className="w-20 h-20 rounded-full border-2 border-outline-variant/30 bg-surface-bright/30 flex items-center justify-center">
            <span className="text-4xl">👀</span>
          </div>
          <p className="font-display font-bold uppercase tracking-widest text-on-surface-variant text-sm">
            Host is picking a question…
          </p>
        </div>
      )}

      {/* Active Question */}
      {(effectivePhase === "active_question" || effectivePhase === "buzzed") &&
        state.activeQuestion && (
          <div className="flex flex-col items-center animate-[slide-up_0.3s_ease-out] gap-4">
            {/* Category + value pill */}
            <div className="inline-block px-4 py-1.5 rounded-full bg-[#301a4d]/60 border border-outline-variant/20 backdrop-blur">
              <span className="font-display font-bold text-xs uppercase tracking-[0.2em] text-tertiary">
                {state.activeQuestion.categoryName}
              </span>
            </div>

            {/* Clue card */}
            <div className="relative w-full">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-gold/40 rounded-tl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-gold/40 rounded-br-xl" />
              <div className="absolute -top-3 -right-3 bg-gold text-navy font-display font-black text-sm px-3 py-1 rounded-full rotate-6 z-10">
                ${state.activeQuestion.value}
              </div>
              <div className="rounded-2xl border border-white/5 bg-[#291543]/60 px-6 py-8 text-center backdrop-blur">
                <p className="font-display font-bold text-xl text-on-surface leading-relaxed">
                  {state.activeQuestion.clue}
                </p>
              </div>
            </div>

            {/* Revealed answer */}
            {state.revealedAnswer && (
              <div
                className={cn(
                  "w-full rounded-xl border px-6 py-3 text-sm text-center font-display font-bold uppercase tracking-wide",
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

            {/* Buzz / steal / waiting states */}
            {effectivePhase === "buzzed" && state.buzzedPlayer ? (
              <div className="w-full flex flex-col items-center gap-3">
                <div
                  className={cn(
                    "w-full rounded-2xl border p-5 text-center font-display text-xl font-bold uppercase tracking-wide",
                    state.buzzedPlayer.playerName === myName
                      ? "border-gold/40 bg-gold/10 text-gold shadow-[0_0_30px_rgba(255,254,172,0.15)]"
                      : "border-outline-variant/20 bg-[#291543] text-on-surface",
                  )}
                >
                  {state.buzzedPlayer.playerName === myName
                    ? "⚡ YOU buzzed in! Answer the host."
                    : `${state.buzzedPlayer.playerName} buzzed in!`}
                </div>
                {state.buzzDeadline && buzzSecondsLeft !== null && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-on-surface-variant" />
                    <span
                      className={cn(
                        "font-display font-black text-xl",
                        buzzSecondsLeft <= 5
                          ? "text-red-400 animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
                          : "text-gold drop-shadow-glow",
                      )}
                    >
                      {buzzSecondsLeft}s
                    </span>
                  </div>
                )}
              </div>
            ) : isStealPhase ? (
              <div className="w-full flex flex-col items-center gap-4">
                <p className="font-display text-lg font-bold uppercase tracking-widest text-yellow-400">
                  Steal opportunity!
                </p>
                {stealSecondsLeft !== null && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-on-surface-variant" />
                    <span
                      className={cn(
                        "font-display font-black text-xl",
                        stealSecondsLeft <= 5
                          ? "text-red-400 animate-[countdown-pulse_0.8s_ease-in-out_infinite]"
                          : "text-gold drop-shadow-glow",
                      )}
                    >
                      {stealSecondsLeft}s
                    </span>
                  </div>
                )}
                {iFailedBuzz ? (
                  <div className="w-full rounded-2xl border border-outline-variant/20 bg-[#22103a] p-5 text-center">
                    <p className="font-display text-lg font-bold uppercase tracking-wide text-on-surface-variant">
                      You already answered wrong
                    </p>
                    <p className="text-outline text-sm mt-1">
                      Can&apos;t buzz again on this question
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={buzzIn}
                    className="w-full rounded-full bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-navy font-display text-2xl font-black uppercase tracking-widest py-5 shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:shadow-[0_0_40px_rgba(234,179,8,0.6)] transition-all duration-150"
                  >
                    STEAL!
                  </button>
                )}
              </div>
            ) : !state.revealedAnswer ? (
              /* Big BUZZ button — mobile controller style */
              <div className="w-full flex flex-col items-center mt-4">
                <button
                  onClick={buzzIn}
                  className="relative group w-64 h-64 flex items-center justify-center select-none active:scale-95 transition-transform duration-75"
                >
                  <div className="absolute inset-0 bg-gold/20 rounded-full blur-3xl group-active:bg-gold/40 transition-colors" />
                  <div className="absolute inset-3 bg-gold rounded-full shadow-[0_0_60px_rgba(255,254,172,0.6)]" />
                  <div className="absolute inset-3 rounded-full bg-linear-to-br from-gold via-[#f3f300] to-[#e4e400] border-4 border-white/20 flex flex-col items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-b from-white/10 to-transparent" />
                    <span className="relative z-10 text-navy font-display font-black text-5xl italic tracking-tighter uppercase drop-shadow-sm">
                      BUZZ
                    </span>
                    <span className="relative z-10 text-navy/40 font-display font-bold text-[10px] uppercase tracking-[0.3em] mt-1">
                      Tap to Answer
                    </span>
                  </div>
                </button>
              </div>
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
            <Trophy className="w-16 h-16 text-gold mb-4 drop-shadow-[0_0_30px_rgba(255,254,172,0.6)] animate-[pulse-gold_2s_ease-in-out_infinite]" />
            <h2 className="font-display text-4xl font-black italic uppercase tracking-tight text-gold mb-2">
              Game Over!
            </h2>
            <p className="text-on-surface-variant text-sm font-display font-bold uppercase tracking-widest mb-10">
              Final Scores
            </p>
            <div className="flex gap-3 flex-wrap justify-center mb-10">
              {Object.entries(state.finalScores ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([connId, score], i) => {
                  const p = state.players.find((pl) => pl.connId === connId);
                  return (
                    <div
                      key={connId}
                      className={cn(
                        "flex flex-col items-center p-5 rounded-2xl border min-w-[110px] backdrop-blur-md",
                        p?.playerName === myName ? "ring-2 ring-gold/30" : "",
                        i === 0
                          ? "border-gold/40 bg-[#291543] shadow-[0_0_30px_rgba(255,254,172,0.15)]"
                          : "border-outline-variant/20 bg-[#22103a]",
                      )}
                    >
                      <span className="text-3xl mb-1">
                        {i === 0 ? "🏆" : `#${i + 1}`}
                      </span>
                      <span className="font-display font-bold text-on-surface">
                        {p?.playerName ?? connId}
                      </span>
                      <span
                        className={cn(
                          "font-display text-2xl font-black mt-1",
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
            <Button
              variant="gold"
              size="lg"
              onClick={() => navigate("/")}
              className="rounded-full font-display font-black uppercase tracking-wider"
            >
              Play Again
            </Button>
          </div>
        ))}
    </div>
  );
}
