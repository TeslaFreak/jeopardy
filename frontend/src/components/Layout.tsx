import { Link, useLocation } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function Navbar() {
  const location = useLocation();
  const { authStatus, signOut } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isAuthenticated = authStatus === "authenticated";
  const isPlayPage = location.pathname === "/play";
  const isTVPage = location.pathname === "/tv";
  if (isTVPage) return null;

  return (
    <nav className="sticky top-0 z-40 border-b border-outline-variant/20 bg-navy/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="group">
          <span className="font-display text-xl font-black italic uppercase tracking-tight text-gold drop-shadow-[0_0_10px_rgba(255,254,172,0.4)] group-hover:drop-shadow-[0_0_16px_rgba(255,254,172,0.8)] transition-all">
            JEOPARDY!
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {!isPlayPage && isAuthenticated && (
            <>
              <Link to="/sets">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gold/70 hover:text-gold uppercase tracking-wider text-xs font-bold"
                >
                  My Sets
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="gap-1.5 text-outline hover:text-gold/70"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            </>
          )}
          {!isPlayPage && !isAuthenticated && (
            <Link to="/login">
              <Button
                variant="outline"
                size="sm"
                className="uppercase tracking-wider text-xs"
              >
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
  const location = useLocation();
  const isTVPage = location.pathname === "/tv";
  return (
    <div
      className={
        isTVPage
          ? "h-screen overflow-hidden bg-navy"
          : "min-h-screen bg-navy flex flex-col"
      }
    >
      <Navbar />
      <main className={isTVPage ? "h-full" : "flex-1"}>{children}</main>
    </div>
  );
}
