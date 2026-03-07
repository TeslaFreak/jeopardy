import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useGameSocket } from "../hooks/useGameSocket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Loader2,
  Users,
  Play,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type HostPhase = "loading" | "waiting_for_room" | "lobby" | "active" | "ended";

const VALUES = [100, 200, 300, 400, 500];

export default function HostGame() {
  const { setId } = useParams<{ setId: string }>();
  const [phase, setPhase] = useState<HostPhase>("waiting_for_room");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const { state, connect, sendMessage } = useGameSocket();

  useEffect(() => {
    apiFetch<{ roomCode: string }>(`/sets/${setId}/host`, { method: "POST" })
      .then(({ roomCode }) => {
        setRoomCode(roomCode);
        connect(roomCode, "__host__", true);
      })
      .catch((err) => alert(`Failed to start room: ${(err as Error).message}`));
  }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.phase === "lobby") setPhase("lobby");
    if (state.phase === "active") setPhase("active");
    if (state.phase === "ended") setPhase("ended");
  }, [state.phase]);

  function startGame() {
    sendMessage("START_GAME", {});
  }
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

  if (phase === "waiting_for_room") {
    return (
      <div className="flex items-center justify-center h-64 text-white/40">
        <Loader2 className="w-8 h-8 animate-spin mr-3" />
        Starting room…
      </div>
    );
  }

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
        <div className="ml-auto">
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
        <div className="flex flex-col items-center justify-center py-20 gap-6">
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
          <Button
            variant="gold"
            size="xl"
            onClick={startGame}
            disabled={state.players.length === 0}
            className="gap-3"
          >
            <Play className="w-5 h-5" />
            Start Game
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
            {state.buzzedPlayer && (
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
                  Answer
                </p>
                <p className="text-xl font-bold text-emerald-400">
                  {state.activeQuestion.answer}
                </p>
              </div>
            )}
          </div>

          {state.buzzedPlayer ? (
            <div className="flex flex-col items-center gap-4">
              <div className="text-lg font-semibold text-white">
                <span className="text-gold">
                  {state.buzzedPlayer.playerName}
                </span>{" "}
                buzzed in!
              </div>
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
                  Wrong −${state.activeQuestion.value}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-white/40 animate-pulse">
              Waiting for a player to buzz in…
            </p>
          )}
        </div>
      )}

      {/* Ended */}
      {phase === "ended" && state.finalScores && (
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
      )}
    </div>
  );
}
