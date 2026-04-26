import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Tv2 } from "lucide-react";

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
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-4 py-20 overflow-hidden relative">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-secondary/5 blur-[100px]" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-tertiary/5 blur-[100px]" />
      </div>

      {/* Hero */}
      <div className="mb-12 text-center animate-[fade-in_0.6s_ease-out]">
        <p className="font-display text-secondary text-sm font-bold uppercase tracking-[0.3em] mb-3">
          JOIN THE SHOW
        </p>
        <h1 className="font-display text-6xl sm:text-8xl font-black italic tracking-tighter text-gold drop-shadow-[0_0_40px_rgba(255,254,172,0.4)] mb-3">
          JEOPARDY!
        </h1>
        <p className="text-outline text-sm max-w-xs mx-auto">
          Host trivia nights with your friends — Jackbox‑style.
        </p>
      </div>

      {/* Cards */}
      <div className="w-full max-w-2xl grid md:grid-cols-2 gap-5 animate-[slide-up_0.5s_ease-out]">
        {/* Join Game */}
        <div className="rounded-2xl border border-outline-variant/30 bg-navy-3 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
              <span className="text-secondary text-lg">⚡</span>
            </div>
            <div>
              <h2 className="font-display text-base font-bold uppercase tracking-wider text-gold">
                Join a Game
              </h2>
              <p className="text-xs text-outline">
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
              className="text-center text-2xl font-display tracking-[0.4em] font-bold uppercase h-14 bg-navy-2 border-outline-variant/40 focus:border-secondary/60 focus:ring-secondary/20 text-gold placeholder:text-outline/40"
            />
            <Button
              type="submit"
              variant="gold"
              size="lg"
              disabled={roomCode.trim().length < 4}
              className="w-full font-display font-black uppercase tracking-wider rounded-full"
            >
              Join Game <ChevronRight className="w-4 h-4" />
            </Button>
          </form>
        </div>

        {/* Host Game */}
        <div className="rounded-2xl border border-outline-variant/30 bg-navy-3 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
              <Tv2 className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold uppercase tracking-wider text-gold">
                Host a Game
              </h2>
              <p className="text-xs text-outline">
                Create and run your own game
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 flex-1 justify-end">
            {isAuthenticated ? (
              <Link to="/sets" className="w-full">
                <Button
                  variant="gold"
                  size="lg"
                  className="w-full font-display font-black uppercase tracking-wider rounded-full"
                >
                  My Game Sets <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Link to="/login" className="w-full">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full font-display font-black uppercase tracking-wider rounded-full"
                >
                  Sign In to Host <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <p className="mt-10 text-outline/50 text-xs tracking-widest uppercase">
        No account needed to play · Free to host
      </p>
    </div>
  );
}
