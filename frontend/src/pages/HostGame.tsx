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
  Timer,
  Clock,
} from "lucide-react";

type HostPhase = "loading" | "waiting_for_room" | "lobby" | "active" | "ended";

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
  label,
}: {
  secondsLeft: number | null;
  label: string;
}) {
  if (secondsLeft === null) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Clock className="w-4 h-4 text-white/40" />
      <span className="text-white/40">{label}</span>
      <span
        className={cn(
          "font-display font-bold text-lg min-w-[2ch] text-center",
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

// ── Main Component ──────────────────────────────────────────────────────
export default function HostGame() {
  const { setId } = useParams<{ setId: string }>();
  const [phase, setPhase] = useState<HostPhase>("waiting_for_room");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const { state, connect, sendMessage } = useGameSocket();

  // Config state for lobby
  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);

  // Timer hooks
  const { secondsLeft: buzzSecondsLeft, isExpired: buzzExpired } = useCountdown(
    state.buzzDeadline,
  );
  const { secondsLeft: stealSecondsLeft, isExpired: stealExpired } =
    useCountdown(state.stealDeadline);

  // Track whether we already fired the timer expiry message
  const buzzExpiredSentRef = useRef(false);
  const stealExpiredSentRef = useRef(false);

  // Reset sent flags when new deadlines arrive
  useEffect(() => {
    buzzExpiredSentRef.current = false;
  }, [state.buzzDeadline]);
  useEffect(() => {
    stealExpiredSentRef.current = false;
  }, [state.stealDeadline]);

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
    apiFetch<{ roomCode: string }>(`/sets/${setId}/host`, { method: "POST" })
      .then(({ roomCode }) => {
        setRoomCode(roomCode);
        connect(roomCode, "__host__", true, "host");
      })
      .catch((err) => alert(`Failed to start room: ${(err as Error).message}`));
  }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.phase === "lobby") setPhase("lobby");
    if (state.phase === "active") setPhase("active");
    if (state.phase === "ended") setPhase("ended");
  }, [state.phase]);

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
    if (confirm("End the game now?")) sendMessage("END_GAME", {});
  }
  function openTvView() {
    if (!roomCode) return;
    const url = `/tv?room=${roomCode}`;
    window.open(url, "_blank", "noopener");
  }

  if (phase === "waiting_for_room") {
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
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openTvView}
            className="gap-1.5"
          >
            <Monitor className="w-4 h-4" />
            Open TV View
          </Button>
          <Button variant="danger" size="sm" onClick={endGame}>
            End Game
          </Button>
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
      {phase === "lobby" && (
        <div className="flex flex-col items-center justify-center py-10 gap-8">
          <div className="text-center">
            <p className="font-display text-2xl text-white/60 mb-1">
              {state.players.length === 0
                ? "Waiting for players…"
                : `${state.players.length} player${state.players.length !== 1 ? "s" : ""} ready`}
            </p>
            <p className="text-white/30 text-sm">
              Players join at jeopardy.allmon.digital
            </p>
          </div>

          {/* Config panel */}
          <div className="rounded-2xl border border-white/10 bg-surface p-6 w-full max-w-md">
            <h3 className="font-display text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Timer className="w-5 h-5 text-gold" />
              Game Settings
            </h3>

            {/* Buzz-in timer */}
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-white/70">Buzz-in timer</label>
              <div className="flex items-center gap-2">
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
                    "w-10 h-6 rounded-full transition-colors relative",
                    config.buzzInTimer.enabled ? "bg-gold" : "bg-white/20",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                      config.buzzInTimer.enabled
                        ? "translate-x-4.5"
                        : "translate-x-0.5",
                    )}
                  />
                </button>
                {config.buzzInTimer.enabled && (
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
                    className="w-16 h-8 rounded-lg bg-navy-3 border border-white/10 text-center text-sm text-white"
                  />
                )}
              </div>
            </div>

            {/* Steal timer */}
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-white/70">Steal timer</label>
              <div className="flex items-center gap-2">
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
                    "w-10 h-6 rounded-full transition-colors relative",
                    config.stealTimer.enabled ? "bg-gold" : "bg-white/20",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                      config.stealTimer.enabled
                        ? "translate-x-4.5"
                        : "translate-x-0.5",
                    )}
                  />
                </button>
                {config.stealTimer.enabled && (
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
                    className="w-16 h-8 rounded-lg bg-navy-3 border border-white/10 text-center text-sm text-white"
                  />
                )}
              </div>
            </div>

            {/* Wrong answer penalty */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-white/70">Wrong answer</label>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      wrongAnswerPenalty: "subtract",
                    }))
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                    config.wrongAnswerPenalty === "subtract"
                      ? "bg-red-500/20 text-red-400 border border-red-500/40"
                      : "bg-white/5 text-white/40 border border-white/10",
                  )}
                >
                  −Points
                </button>
                <button
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      wrongAnswerPenalty: "nothing",
                    }))
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                    config.wrongAnswerPenalty === "nothing"
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                      : "bg-white/5 text-white/40 border border-white/10",
                  )}
                >
                  No penalty
                </button>
              </div>
            </div>
          </div>

          <Button
            variant="gold"
            size="xl"
            onClick={startGame}
            disabled={state.players.length === 0}
            className="gap-3"
          >
            <Play className="w-5 h-5" />
            {state.players.length === 0
              ? "Waiting for players to join…"
              : "Start Game"}
          </Button>
        </div>
      )}

      {/* Active — Board */}
      {phase === "active" && !state.activeQuestion && (
        <div className="overflow-x-auto rounded-xl border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <table
            className="w-full border-collapse"
            style={{ minWidth: `${state.board.length * 140}px` }}
          >
            <thead>
              <tr>
                {state.board.map((cat) => (
                  <th
                    key={cat.slug}
                    className="bg-board border-b-2 border-black/30 px-3 py-4 text-center"
                  >
                    <span className="font-display font-semibold text-sm text-white uppercase tracking-wider">
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
                        onClick={() => !used && selectQuestion(cat.slug, val)}
                        className={cn(
                          "border border-black/40 text-center h-20 transition-all duration-150",
                          used
                            ? "bg-navy cursor-default"
                            : "bg-board hover:bg-board-hover cursor-pointer",
                        )}
                      >
                        {!used && (
                          <span className="font-display font-bold text-2xl text-gold">
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

      {/* Active — Question Reveal */}
      {phase === "active" && state.activeQuestion && (
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
                  label="Time to answer"
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
                label="Steal window"
              />
              <p className="text-white/40 text-sm">
                Waiting for another player to buzz in…
              </p>
            </div>
          ) : (
            <p className="text-white/40 animate-pulse">
              Waiting for a player to buzz in…
            </p>
          )}
        </div>
      )}

      {/* Ended */}
      {phase === "ended" &&
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
