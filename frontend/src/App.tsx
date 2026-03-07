import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuthenticator, Authenticator } from "@aws-amplify/ui-react";
import { useEffect } from "react";
import { Layout } from "@/components/Layout";

import Home from "./pages/Home";
import Sets from "./pages/Sets";
import SetBuilder from "./pages/SetBuilder";
import HostGame from "./pages/HostGame";
import Play from "./pages/Play";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const location = useLocation();
  if (authStatus === "configuring")
    return (
      <div className="flex items-center justify-center h-32 text-white/40">
        <span>Loading…</span>
      </div>
    );
  if (authStatus !== "authenticated") return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function LoginPage() {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/sets";

  useEffect(() => {
    if (authStatus === "authenticated") {
      navigate(from, { replace: true });
    }
  }, [authStatus, navigate, from]);

  if (authStatus === "authenticated") return null;

  return (
    <div className="flex justify-center items-start pt-16 px-4 min-h-[calc(100vh-3.5rem)]">
      <Authenticator />
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/login"
          element={<LoginPage />}
        />
        <Route
          path="/sets"
          element={
            <RequireAuth>
              <Sets />
            </RequireAuth>
          }
        />
        <Route
          path="/sets/:setId"
          element={
            <RequireAuth>
              <SetBuilder />
            </RequireAuth>
          }
        />
        <Route
          path="/sets/:setId/host"
          element={
            <RequireAuth>
              <HostGame />
            </RequireAuth>
          }
        />
        <Route path="/play" element={<Play />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
