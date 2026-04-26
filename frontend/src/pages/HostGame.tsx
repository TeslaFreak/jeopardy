import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useGameSocket } from "../hooks/useGameSocket";
import { useCountdown } from "../hooks/useCountdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GameConfig } from "../types";
import { DEFAULT_GAME_CONFIG } from "../types";
import {
  Trophy,
  Loader2,
  Users,
  Play,
  CheckCircle2,
  XCircle,
  Monitor,
} from "lucide-react";

const VALUES = [100, 200, 300, 400, 500];

// ── Anticipation + Winner reveal component ────────────────────────────────
function WinnerReveal({
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
      <div className="flex flex-col items-center py-20 gap-6">
        <div className="text-center">
          <p className="font-display text-3xl text-white/60 mb-4">
            All questions answered!
          </p>
          <p className="font-display text-5xl text-gold animate-[drumroll_0.6s_ease-in-out_infinite]">
            And the winner is…
          </p>
        </div>
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
    <div className="flex flex-col items-center py-12 animate-[winner-reveal_0.6s_ease-out]">
      <Trophy className="w-20 h-20 text-gold mb-4 drop-shadow-[0_0_40px_rgba(245,197,24,0.8)] animate-[pulse-gold_2s_ease-in-out_infinite]" />
      <h2 className="font-display text-5xl font-bold text-gold mb-2 animate-[glow-text-gold_3s_ease-in-out_infinite]">
        {winnerName}
      </h2>
      <p className="font-display text-2xl text-white/60 mb-10">
        ${winnerScore}
      </p>
      <div className="flex gap-4 flex-wrap justify-center mb-10">
        {sorted.map(([connId, score], i) => {
          const player = players.find((p) => p.connId === connId);
          return (
            <div
              key={connId}
              className={cn(
                "flex flex-col items-center p-5 rounded-2xl border min-w-[120px]",
                i === 0
                  ? "border-gold bg-gold/20 shadow-[0_0_30px_rgba(245,197,24,0.3)]"
                  : "border-white/10 bg-surface",
              )}
            >
              <span className="text-3xl mb-1">
                {i === 0 ? "🏆" : `#${i + 1}`}
              </span>
              <span className="font-semibold text-white">
                {player?.playerName ?? connId}
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
      <Link to="/sets">
        <Button variant="gold" size="lg">
          Back to My Sets
        </Button>
      </Link>
    </div>
  );
}

// ── Timer display ────────────────────────────────────────────────────────
function TimerDisplay({
  secondsLeft,
  totalSeconds,
  label,
  color = "gold",
}: {
  secondsLeft: number | null;
  totalSeconds: number | null;
  label: string;
  color?: "gold" | "cyan" | "yellow";
}) {
  if (secondsLeft === null) return null;
  const pct = totalSeconds
    ? Math.max(0, (secondsLeft / totalSeconds) * 100)
    : 100;
  const isLow = secondsLeft <= 5;

  const colorMap = {
    gold: {
      text: isLow ? "text-red-400" : "text-gold",
      bar: "from-gold to-gold/70",
      track: "bg-gold/10",
      glow: "shadow-[0_0_12px_rgba(255,254,172,0.25)]",
    },
    cyan: {
      text: isLow ? "text-red-400" : "text-secondary",
      bar: "from-secondary to-secondary/70",
      track: "bg-secondary/10",
      glow: "shadow-[0_0_12px_rgba(0,227,253,0.25)]",
    },
    yellow: {
      text: isLow ? "text-red-400" : "text-yellow-400",
      bar: "from-yellow-400 to-yellow-400/70",
      track: "bg-yellow-400/10",
      glow: "shadow-[0_0_12px_rgba(250,204,21,0.25)]",
    },
  }[color];

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-xs">
      <div className="flex items-center gap-2">
        <span className="text-white/40 text-xs uppercase tracking-widest">
          {label}
        </span>
      </div>
      <span
        className={cn(
          "font-display font-black text-5xl min-w-[2ch] text-center leading-none",
          colorMap.text,
          isLow && "animate-[countdown-pulse_0.8s_ease-in-out_infinite]",
        )}
      >
        {secondsLeft}
      </span>
      <div
        className={cn(
          "w-full h-2 rounded-full p-0.5 relative overflow-hidden",
          colorMap.track,
          colorMap.glow,
        )}
      >
        <div
          className={cn(
            "h-full bg-linear-to-r rounded-full transition-[width] duration-300",
            colorMap.bar,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────
export default function HostGame() {
  const { setId } = useParams<{ setId: string }>();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [tvIsOpen, setTvIsOpen] = useState(false);
  const tvWindowRef = useRef<Window | null>(null);
  const tvHeartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { state, connect, sendMessage } = useGameSocket();

  // Listen for heartbeats from the TV tab via BroadcastChannel.
  // This lets us track tvIsOpen across host page refreshes (when the window ref is lost).
  useEffect(() => {
    const channel = new BroadcastChannel("jeopardy-tv-status");
    const markOpen = () => {
      setTvIsOpen(true);
      if (tvHeartbeatTimerRef.current)
        clearTimeout(tvHeartbeatTimerRef.current);
      // If no heartbeat for 12 s, assume TV tab was closed
      tvHeartbeatTimerRef.current = setTimeout(() => {
        setTvIsOpen(false);
        tvWindowRef.current = null;
      }, 12_000);
    };
    channel.onmessage = (e: MessageEvent<{ type: string }>) => {
      if (e.data.type === "tv-heartbeat") markOpen();
      if (e.data.type === "tv-closed") {
        if (tvHeartbeatTimerRef.current)
          clearTimeout(tvHeartbeatTimerRef.current);
        setTvIsOpen(false);
        tvWindowRef.current = null;
      }
    };
    return () => {
      channel.close();
      if (tvHeartbeatTimerRef.current)
        clearTimeout(tvHeartbeatTimerRef.current);
    };
  }, []);

  // Config state for lobby
  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);

  // Timer hooks
  const {
    secondsLeft: buzzSecondsLeft,
    totalSeconds: buzzTotalSeconds,
    isExpired: buzzExpired,
  } = useCountdown(state.buzzDeadline);
  const {
    secondsLeft: stealSecondsLeft,
    totalSeconds: stealTotalSeconds,
    isExpired: stealExpired,
  } = useCountdown(state.stealDeadline);
  const {
    secondsLeft: questionSecondsLeft,
    totalSeconds: questionTotalSeconds,
    isExpired: questionExpired,
  } = useCountdown(state.questionDeadline);

  // Track whether we already fired the timer expiry message
  const buzzExpiredSentRef = useRef(false);
  const stealExpiredSentRef = useRef(false);
  const questionExpiredSentRef = useRef(false);

  // Reset sent flags when new deadlines arrive
  useEffect(() => {
    buzzExpiredSentRef.current = false;
  }, [state.buzzDeadline]);
  useEffect(() => {
    stealExpiredSentRef.current = false;
  }, [state.stealDeadline]);
  useEffect(() => {
    questionExpiredSentRef.current = false;
  }, [state.questionDeadline]);

  // Fire timer expiry messages
  useEffect(() => {
    if (buzzExpired && !buzzExpiredSentRef.current && state.buzzedPlayer) {
      buzzExpiredSentRef.current = true;
      sendMessage("BUZZ_TIMER_EXPIRED", {});
    }
  }, [buzzExpired, state.buzzedPlayer, sendMessage]);

  useEffect(() => {
    if (stealExpired && !stealExpiredSentRef.current && state.stealDeadline) {
      stealExpiredSentRef.current = true;
      sendMessage("STEAL_EXPIRED", {});
    }
  }, [stealExpired, state.stealDeadline, sendMessage]);

  useEffect(() => {
    // Only fire if nobody has buzzed in yet (question timer is pre-buzz)
    if (
      questionExpired &&
      !questionExpiredSentRef.current &&
      state.questionDeadline &&
      !state.buzzedPlayer
    ) {
      questionExpiredSentRef.current = true;
      sendMessage("QUESTION_TIMER_EXPIRED", {});
    }
  }, [
    questionExpired,
    state.questionDeadline,
    state.buzzedPlayer,
    sendMessage,
  ]);

  useEffect(() => {
    const storageKey = `host_room_${setId}`;
    const storedRoom = sessionStorage.getItem(storageKey);

    if (storedRoom) {
      setRoomCode(storedRoom);
      connect(storedRoom, "__host__", true, "host");
    } else {
      apiFetch<{ roomCode: string }>(`/sets/${setId}/host`, { method: "POST" })
        .then(({ roomCode }) => {
          sessionStorage.setItem(storageKey, roomCode);
          setRoomCode(roomCode);
          connect(roomCode, "__host__", true, "host");
        })
        .catch((err) =>
          alert(`Failed to start room: ${(err as Error).message}`),
        );
    }
  }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.phase === "ended") {
      sessionStorage.removeItem(`host_room_${setId}`);
    }
  }, [state.phase, setId]);

  // Auto-recover from stale sessionStorage: if reconnect to a cached room
  // was rejected (404/410), clear the bad code and open a fresh room.
  useEffect(() => {
    if (state.error && state.phase === "idle" && roomCode) {
      const storageKey = `host_room_${setId}`;
      sessionStorage.removeItem(storageKey);
      setRoomCode(null);
      apiFetch<{ roomCode: string }>(`/sets/${setId}/host`, { method: "POST" })
        .then(({ roomCode: newCode }) => {
          sessionStorage.setItem(storageKey, newCode);
          setRoomCode(newCode);
          connect(newCode, "__host__", true, "host");
        })
        .catch((err) =>
          alert(`Failed to start room: ${(err as Error).message}`),
        );
    }
  }, [state.error, state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = useCallback(() => {
    sendMessage("START_GAME", { config });
  }, [sendMessage, config]);

  function selectQuestion(categorySlug: string, value: number) {
    sendMessage("SELECT_QUESTION", { categorySlug, value });
  }
  function judgeAnswer(correct: boolean) {
    if (!state.buzzedPlayer || !state.activeQuestion) return;
    sendMessage("JUDGE_ANSWER", {
      correct,
      playerId: state.buzzedPlayer.playerId,
      value: state.activeQuestion.value,
    });
  }
  function endGame() {
    sendMessage("END_GAME", {});
  }
  function openTvView() {
    if (!roomCode) return;
    // If already open and not closed, just focus it
    if (tvWindowRef.current && !tvWindowRef.current.closed) {
      tvWindowRef.current.focus();
      return;
    }
    const url = `/tv?room=${roomCode}`;
    const win = window.open(url, "jeopardy-tv");
    tvWindowRef.current = win;
  }

  if (!roomCode) {
    return (
      <div className="flex items-center justify-center h-64 text-white/40">
        <Loader2 className="w-8 h-8 animate-spin mr-3" />
        Starting room…
      </div>
    );
  }

  // Determine whether we're in the steal phase
  const isStealPhase =
    state.stealDeadline !== null && !state.buzzedPlayer && state.activeQuestion;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {state.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 text-red-300 px-4 py-3 mb-4 text-sm">
          {state.error}
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">
            Room Code
          </p>
          <div className="flex items-center gap-2">
            {roomCode && (
              <div className="font-display text-4xl font-bold tracking-[0.25em] text-gold animate-[glow-text-gold_3s_ease-in-out_infinite]">
                {roomCode}
              </div>
            )}
            <Badge variant="board" className="hidden sm:flex">
              <Users className="w-3 h-3 mr-1" />
              {state.players.length} player
              {state.players.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          <p className="text-xs text-white/30 mt-1">
            Share this code with players
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* TV View — primary action, needs to be obvious to new hosts */}
          <button
            onClick={openTvView}
            className={cn(
              "relative flex flex-col items-center gap-0.5 px-5 py-2.5 rounded-xl border transition-all duration-150 active:scale-95",
              tvIsOpen
                ? "border-secondary/20 bg-secondary/5 text-secondary/50 hover:bg-secondary/10 hover:border-secondary/40 hover:text-secondary/70"
                : "border-secondary/50 bg-secondary/10 text-secondary hover:bg-secondary/20 hover:border-secondary/80 animate-[pulse-cyan_2.5s_ease-in-out_infinite]",
            )}
          >
            <div className="flex items-center gap-1.5 font-display font-bold text-sm uppercase tracking-wider">
              <Monitor className="w-4 h-4" />
              {tvIsOpen ? "TV View Open" : "Open TV View"}
            </div>
            <span
              className={cn(
                "text-[10px] font-display uppercase tracking-widest",
                tvIsOpen ? "text-secondary/40" : "text-secondary/60",
              )}
            >
              {tvIsOpen ? "Click to refocus" : "Audience display"}
            </span>
          </button>

          {/* End Game — only shown once the game is active, inline two-step confirm */}
          {state.phase === "active" &&
            (confirmEnd ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-900/10 px-3 py-2">
                <span className="text-xs text-red-400 font-display font-bold uppercase tracking-wide">
                  End game?
                </span>
                <button
                  onClick={() => setConfirmEnd(false)}
                  className="text-xs text-white/50 hover:text-white font-display uppercase tracking-wide px-2 py-1 rounded-lg hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    endGame();
                    setConfirmEnd(false);
                  }}
                  className="text-xs text-white font-display font-bold uppercase tracking-wide bg-red-700 hover:bg-red-600 px-3 py-1 rounded-lg transition-all active:scale-95"
                >
                  Confirm
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEnd(true)}
                className="text-red-400/60 hover:text-red-300 hover:bg-red-900/20 font-display text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-xl transition-all duration-150"
              >
                End Game
              </button>
            ))}
        </div>
      </div>

      {/* Scoreboard */}
      {state.players.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {state.players.map((p) => (
            <div
              key={p.connId}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
                state.buzzedPlayer?.playerId === p.connId
                  ? "border-gold bg-gold/20 shadow-[0_0_20px_rgba(245,197,24,0.4)]"
                  : state.failedBuzzPlayers.includes(p.connId)
                    ? "border-red-500/30 bg-red-900/10"
                    : "border-white/10 bg-surface",
              )}
            >
              <div className="font-semibold text-sm text-white">
                {p.playerName}
              </div>
              <div className="font-display font-bold text-gold text-sm">
                ${state.scores[p.connId] ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lobby */}
      {state.phase === "lobby" && (
        <div className="flex flex-col gap-5">
          {/* Status banner */}
          <div className="flex items-center gap-4 rounded-2xl border border-secondary/25 bg-secondary/5 px-5 py-4">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-secondary" />
            </span>
            <div>
              <p className="font-display font-bold text-secondary text-sm uppercase tracking-widest leading-none">
                Lobby is open
              </p>
              <p className="text-white/40 text-xs mt-1">
                Players join at{" "}
                <span className="text-white/60">jeopardy.allmon.digital</span>{" "}
                using room code{" "}
                <span className="text-gold font-bold font-display">
                  {roomCode}
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
            {/* Settings card */}
            <div className="rounded-2xl border border-white/10 bg-surface p-6 order-2 lg:order-1">
              <div className="mb-5">
                <h3 className="font-display font-bold text-white text-base">
                  Customize your game
                </h3>
                <p className="text-white/30 text-xs mt-1">
                  These settings lock in when you hit Start — you can't change
                  them mid-game
                </p>
              </div>

              <div className="space-y-0 divide-y divide-white/5">
                {/* Buzz-in timer */}
                <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Buzz-in timer
                    </p>
                    <p className="text-xs text-white/35 mt-0.5 leading-snug">
                      How long the player who buzzes in has to answer before
                      their turn expires
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {config.buzzInTimer.enabled && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={5}
                          max={120}
                          value={config.buzzInTimer.seconds}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              buzzInTimer: {
                                ...c.buzzInTimer,
                                seconds: Number(e.target.value) || 20,
                              },
                            }))
                          }
                          className="w-14 h-8 rounded-lg bg-navy-3 border border-white/10 text-center text-sm text-white"
                        />
                        <span className="text-xs text-white/30">sec</span>
                      </div>
                    )}
                    <button
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          buzzInTimer: {
                            ...c.buzzInTimer,
                            enabled: !c.buzzInTimer.enabled,
                          },
                        }))
                      }
                      className={cn(
                        "w-11 h-6 rounded-full transition-all duration-200 relative shrink-0",
                        config.buzzInTimer.enabled ? "bg-gold" : "bg-white/15",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
                          config.buzzInTimer.enabled
                            ? "left-[calc(100%-1.375rem)]"
                            : "left-0.5",
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Question timer (buzz window) */}
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Buzz window
                    </p>
                    <p className="text-xs text-white/35 mt-0.5 leading-snug">
                      Total time players have to buzz in after the question is
                      revealed
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {config.questionTimer.enabled && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={5}
                          max={120}
                          value={config.questionTimer.seconds}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              questionTimer: {
                                ...c.questionTimer,
                                seconds: Number(e.target.value) || 20,
                              },
                            }))
                          }
                          className="w-14 h-8 rounded-lg bg-navy-3 border border-white/10 text-center text-sm text-white"
                        />
                        <span className="text-xs text-white/30">sec</span>
                      </div>
                    )}
                    <button
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          questionTimer: {
                            ...c.questionTimer,
                            enabled: !c.questionTimer.enabled,
                          },
                        }))
                      }
                      className={cn(
                        "w-11 h-6 rounded-full transition-all duration-200 relative shrink-0",
                        config.questionTimer.enabled
                          ? "bg-gold"
                          : "bg-white/15",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
                          config.questionTimer.enabled
                            ? "left-[calc(100%-1.375rem)]"
                            : "left-0.5",
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Steal timer */}
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Steal window
                    </p>
                    <p className="text-xs text-white/35 mt-0.5 leading-snug">
                      Time remaining players get to buzz in after someone
                      answers wrong
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {config.stealTimer.enabled && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={5}
                          max={60}
                          value={config.stealTimer.seconds}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              stealTimer: {
                                ...c.stealTimer,
                                seconds: Number(e.target.value) || 10,
                              },
                            }))
                          }
                          className="w-14 h-8 rounded-lg bg-navy-3 border border-white/10 text-center text-sm text-white"
                        />
                        <span className="text-xs text-white/30">sec</span>
                      </div>
                    )}
                    <button
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          stealTimer: {
                            ...c.stealTimer,
                            enabled: !c.stealTimer.enabled,
                          },
                        }))
                      }
                      className={cn(
                        "w-11 h-6 rounded-full transition-all duration-200 relative shrink-0",
                        config.stealTimer.enabled ? "bg-gold" : "bg-white/15",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
                          config.stealTimer.enabled
                            ? "left-[calc(100%-1.375rem)]"
                            : "left-0.5",
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Wrong answer penalty — separate section */}
              <div className="mt-1 pt-5 border-t border-white/8">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Wrong answer penalty
                    </p>
                    <p className="text-xs text-white/35 mt-0.5 leading-snug">
                      What happens to a player's score when they buzz in and
                      answer incorrectly
                    </p>
                  </div>
                  <div className="flex rounded-xl border border-white/10 overflow-hidden shrink-0 text-xs font-display font-bold uppercase tracking-wide">
                    <button
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          wrongAnswerPenalty: "subtract",
                        }))
                      }
                      className={cn(
                        "px-3 py-2 transition-colors",
                        config.wrongAnswerPenalty === "subtract"
                          ? "bg-red-500/25 text-red-300"
                          : "text-white/30 hover:text-white/50 hover:bg-white/5",
                      )}
                    >
                      −Points
                    </button>
                    <div className="w-px bg-white/10" />
                    <button
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          wrongAnswerPenalty: "nothing",
                        }))
                      }
                      className={cn(
                        "px-3 py-2 transition-colors",
                        config.wrongAnswerPenalty === "nothing"
                          ? "bg-secondary/15 text-secondary"
                          : "text-white/30 hover:text-white/50 hover:bg-white/5",
                      )}
                    >
                      No penalty
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Players card */}
            <div className="rounded-2xl border border-white/10 bg-surface p-6 order-1 lg:order-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-white text-base">
                  Players
                </h3>
                <Badge variant="board">
                  <Users className="w-3 h-3 mr-1" />
                  {state.players.length} joined
                </Badge>
              </div>
              {state.players.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-3 text-center">
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-white/20" />
                  </div>
                  <p className="text-white/30 text-sm leading-relaxed">
                    Players will appear here as they join using the room code
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {state.players.map((p) => (
                    <div
                      key={p.connId}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant/20 bg-navy-3 animate-[slide-up_0.3s_ease-out]"
                    >
                      <span className="font-display font-bold text-sm text-white">
                        {p.playerName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Start game */}
          <Button
            variant="gold"
            size="xl"
            onClick={startGame}
            disabled={state.players.length === 0}
            className="w-full gap-3 font-display font-black uppercase tracking-wider rounded-2xl"
          >
            <Play className="w-5 h-5" />
            {state.players.length === 0
              ? "Waiting for players to join…"
              : `Start Game · ${state.players.length} player${state.players.length !== 1 ? "s" : ""} ready`}
          </Button>
        </div>
      )}

      {/* Active — Board */}
      {state.phase === "active" && !state.activeQuestion && (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${state.board.length || 6}, minmax(0, 1fr))`,
          }}
        >
          {/* Category headers */}
          {state.board.map((cat) => (
            <div
              key={cat.slug}
              className="h-14 flex items-center justify-center text-center px-2 py-1 bg-[#301a4d] rounded-2xl"
            >
              <span className="font-display font-extrabold text-xs text-gold uppercase leading-tight tracking-tight">
                {cat.name}
              </span>
            </div>
          ))}
          {/* Value tiles */}
          {VALUES.map((val) =>
            state.board.map((cat) => {
              const key = `${cat.slug}#${val}`;
              const used = state.usedQuestions.includes(key);
              return (
                <button
                  key={`${cat.slug}-${val}`}
                  disabled={used}
                  onClick={() => selectQuestion(cat.slug, val)}
                  className={cn(
                    "h-16 rounded-2xl flex items-center justify-center relative overflow-hidden transition-all duration-150",
                    used
                      ? "bg-[#150629]/50 border border-outline-variant/10 opacity-30 cursor-default"
                      : "bg-[#291543] border border-secondary/20 shadow-[inset_0_0_15px_rgba(0,227,253,0.05)] hover:bg-[#372056] hover:border-secondary/50 hover:scale-[1.03] cursor-pointer active:scale-[0.97]",
                  )}
                >
                  {!used && (
                    <span className="font-display font-black text-xl text-secondary drop-shadow-[0_0_8px_rgba(0,227,253,0.4)]">
                      ${val}
                    </span>
                  )}
                </button>
              );
            }),
          )}
        </div>
      )}

      {/* Active — Question Reveal */}
      {state.phase === "active" && state.activeQuestion && (
        <div className="flex flex-col items-center text-center py-8 animate-[slide-up_0.3s_ease-out]">
          <Badge variant="board" className="mb-4 text-sm px-4 py-1.5">
            {state.activeQuestion.categoryName} &bull; $
            {state.activeQuestion.value}
          </Badge>
          <div className="rounded-2xl border border-white/10 bg-surface p-8 max-w-2xl w-full mb-6">
            <p className="text-2xl font-semibold text-white leading-relaxed mb-6">
              {state.activeQuestion.clue}
            </p>
            {/* Answer — always visible to host */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
                Answer (host only)
              </p>
              <p className="text-xl font-bold text-emerald-400">
                {state.activeQuestion.answer}
              </p>
            </div>
          </div>

          {/* Revealed answer (broadcast to all after resolution) */}
          {state.revealedAnswer && (
            <div
              className={cn(
                "rounded-xl border px-6 py-3 mb-4 text-sm",
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

          {/* Buzzed player with timer */}
          {state.buzzedPlayer ? (
            <div className="flex flex-col items-center gap-4">
              <div className="text-lg font-semibold text-white">
                <span className="text-gold">
                  {state.buzzedPlayer.playerName}
                </span>{" "}
                buzzed in!
              </div>
              {state.buzzDeadline && (
                <TimerDisplay
                  secondsLeft={buzzSecondsLeft}
                  totalSeconds={buzzTotalSeconds}
                  label="Time to answer"
                  color="gold"
                />
              )}
              <div className="flex gap-3">
                <Button
                  variant="success"
                  size="lg"
                  onClick={() => judgeAnswer(true)}
                  className="gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Correct +${state.activeQuestion.value}
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  onClick={() => judgeAnswer(false)}
                  className="gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  Wrong
                  {state.config?.wrongAnswerPenalty === "subtract"
                    ? ` −$${state.activeQuestion.value}`
                    : ""}
                </Button>
              </div>
            </div>
          ) : isStealPhase ? (
            <div className="flex flex-col items-center gap-4">
              <div className="text-lg font-semibold text-yellow-400">
                Steal opportunity!
              </div>
              <TimerDisplay
                secondsLeft={stealSecondsLeft}
                totalSeconds={stealTotalSeconds}
                label="Steal window"
                color="yellow"
              />
              <p className="text-white/40 text-sm">
                Waiting for another player to buzz in…
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {state.questionDeadline && (
                <TimerDisplay
                  secondsLeft={questionSecondsLeft}
                  totalSeconds={questionTotalSeconds}
                  label="Time to buzz"
                  color="cyan"
                />
              )}
              <p className="text-white/40 animate-pulse">
                Waiting for a player to buzz in…
              </p>
            </div>
          )}
        </div>
      )}

      {/* Ended */}
      {state.phase === "ended" &&
        state.finalScores &&
        (state.isAllQuestionsComplete ? (
          <WinnerReveal
            finalScores={state.finalScores}
            players={state.players}
          />
        ) : (
          <div className="flex flex-col items-center py-12 animate-[slide-up_0.4s_ease-out]">
            <Trophy className="w-16 h-16 text-gold mb-4 drop-shadow-[0_0_30px_rgba(245,197,24,0.6)]" />
            <h2 className="font-display text-4xl font-bold text-gold mb-2">
              Game Over!
            </h2>
            <p className="text-white/50 mb-10">Final Scores</p>
            <div className="flex gap-4 flex-wrap justify-center mb-10">
              {Object.entries(state.finalScores)
                .sort(([, a], [, b]) => b - a)
                .map(([connId, score], i) => {
                  const player = state.players.find((p) => p.connId === connId);
                  return (
                    <div
                      key={connId}
                      className={cn(
                        "flex flex-col items-center p-5 rounded-2xl border min-w-[120px]",
                        i === 0
                          ? "border-gold bg-gold/20 shadow-[0_0_30px_rgba(245,197,24,0.3)]"
                          : "border-white/10 bg-surface",
                      )}
                    >
                      <span className="text-3xl mb-1">
                        {i === 0 ? "🏆" : `#${i + 1}`}
                      </span>
                      <span className="font-semibold text-white">
                        {player?.playerName ?? connId}
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
            <Link to="/sets">
              <Button variant="gold" size="lg">
                Back to My Sets
              </Button>
            </Link>
          </div>
        ))}
    </div>
  );
}
