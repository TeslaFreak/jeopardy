import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Users, Tv2, ChevronRight } from "lucide-react";

export default function Home() {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isAuthenticated = authStatus === "authenticated";
  const [roomCode, setRoomCode] = useState("");
  const navigate = useNavigate();

  function joinGame(e: React.FormEvent) {
    e.preventDefault();
    if (!roomCode.trim()) return;
    navigate(`/play?room=${roomCode.trim().toUpperCase()}`);
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-4 py-20">
      {/* Hero */}
      <div className="mb-10 sm:mb-16 text-center animate-[fade-in_0.6s_ease-out]">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gold/10 border border-gold/30 mb-4 sm:mb-6 animate-[pulse-gold_3s_ease-in-out_infinite]">
          <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-gold" />
        </div>
        <h1 className="font-display text-5xl sm:text-7xl font-bold text-gold tracking-widest mb-3 drop-shadow-[0_0_40px_rgba(245,197,24,0.5)]">
          JEOPARDY!
        </h1>
        <p className="text-white/60 text-lg max-w-sm mx-auto leading-relaxed">
          Host trivia nights with your friends — Jackbox‑style.
        </p>
      </div>

      {/* Cards */}
      <div className="w-full max-w-2xl grid md:grid-cols-2 gap-6 animate-[slide-up_0.5s_ease-out]">
        {/* Join Game */}
        <div className="rounded-2xl border border-white/10 bg-surface p-6 flex flex-col gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-board/30 border border-board/40 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Join a Game
              </h2>
              <p className="text-xs text-white/50">
                Enter the room code to play
              </p>
            </div>
          </div>
          <form onSubmit={joinGame} className="flex flex-col gap-3">
            <Input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              className="text-center text-2xl font-display tracking-[0.4em] font-bold uppercase h-14 bg-navy-3 border-gold/20 focus:border-gold/60 focus:ring-gold/30"
            />
            <Button
              type="submit"
              variant="gold"
              size="lg"
              disabled={roomCode.trim().length < 6}
              className="w-full"
            >
              Join Game <ChevronRight className="w-4 h-4" />
            </Button>
          </form>
        </div>

        {/* Host Game */}
        <div className="rounded-2xl border border-white/10 bg-surface p-6 flex flex-col gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center">
              <Tv2 className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Host a Game
              </h2>
              <p className="text-xs text-white/50">
                Create and run your own game
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 flex-1 justify-end">
            {isAuthenticated ? (
              <Link to="/sets" className="w-full">
                <Button variant="gold" size="lg" className="w-full">
                  My Game Sets <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Link to="/login" className="w-full">
                <Button variant="outline" size="lg" className="w-full">
                  Sign In to Host <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <p className="mt-12 text-white/30 text-sm">
        No account needed to play · Free to host
      </p>
    </div>
  );
}
