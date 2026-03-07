import { Link, useLocation } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Button } from "@/components/ui/button";
import { LogOut, Zap } from "lucide-react";

export function Navbar() {
  const location = useLocation();
  const { authStatus, signOut } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isAuthenticated = authStatus === "authenticated";
  const isPlayPage = location.pathname === "/play";

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-navy-2/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 group">
          <Zap className="h-5 w-5 text-gold group-hover:drop-shadow-[0_0_8px_rgba(245,197,24,0.8)] transition-all" />
          <span className="font-display text-xl font-bold tracking-wide text-gold group-hover:drop-shadow-[0_0_8px_rgba(245,197,24,0.6)] transition-all">
            JEOPARDY!
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {!isPlayPage && isAuthenticated && (
            <>
              <Link to="/sets">
                <Button variant="ghost" size="sm">
                  My Sets
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            </>
          )}
          {!isPlayPage && !isAuthenticated && (
            <Link to="/login">
              <Button variant="outline" size="sm">
                Host Sign In
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-navy flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
