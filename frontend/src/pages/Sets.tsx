import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Plus,
  Pencil,
  Tv2,
  Trash2,
  LayoutGrid,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface SetMeta {
  setId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isComplete: boolean;
}

export default function Sets() {
  const [sets, setSets] = useState<SetMeta[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<SetMeta[]>("/sets")
      .then(setSets)
      .finally(() => setLoading(false));
  }, []);

  async function createSet(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const created = await apiFetch<SetMeta>("/sets", {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      navigate(`/sets/${created.setId}`);
    } finally {
      setCreating(false);
      setOpen(false);
      setNewTitle("");
    }
  }

  async function deleteSet(setId: string) {
    if (!confirm("Delete this set? This cannot be undone.")) return;
    setDeletingId(setId);
    await apiFetch(`/sets/${setId}`, { method: "DELETE" });
    setSets((prev) => prev.filter((s) => s.setId !== setId));
    setDeletingId(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl font-bold text-white">
            My Game Sets
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            {loading
              ? "Loading…"
              : `${sets.length} set${sets.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="gold" size="lg">
              <Plus className="w-4 h-4" />
              New Set
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a New Set</DialogTitle>
            </DialogHeader>
            <form onSubmit={createSet}>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Science & Nature, Pop Culture 2024…"
                autoFocus
                className="mt-2"
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOpen(false);
                    setNewTitle("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  disabled={creating || !newTitle.trim()}
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/40">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div className="w-20 h-20 rounded-3xl bg-navy-2 border border-outline-variant/30 flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.4)]">
            <LayoutGrid className="w-9 h-9 text-outline" />
          </div>
          <div className="text-center">
            <p className="text-white font-display font-bold text-lg">
              No sets yet
            </p>
            <p className="text-on-surface-variant text-sm mt-1">
              Create your first question set to get started.
            </p>
          </div>
          <Button variant="gold" size="lg" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> Create First Set
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sets.map((s) => (
            <div
              key={s.setId}
              className="group relative rounded-2xl border border-outline-variant/20 bg-navy-2 hover:border-gold/30 hover:bg-surface-2 transition-all duration-200 flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.35)] overflow-hidden"
            >
              {/* Completion stripe at top */}
              <div
                className={cn(
                  "h-0.5 w-full",
                  s.isComplete
                    ? "bg-linear-to-r from-emerald-500/60 via-emerald-400/80 to-emerald-500/60"
                    : "bg-linear-to-r from-amber-500/30 via-amber-400/50 to-amber-500/30",
                )}
              />

              <div className="p-5 flex flex-col gap-4 flex-1">
                {/* Title + status */}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-display text-base font-bold text-white group-hover:text-gold transition-colors line-clamp-2 leading-snug">
                      {s.title}
                    </h3>
                    {s.isComplete ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400/70 shrink-0 mt-0.5" />
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant/60">
                    Updated {new Date(s.updatedAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Status pill */}
                <div
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider px-2.5 py-1 rounded-full w-fit",
                    s.isComplete
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                  )}
                >
                  {s.isComplete ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> Ready to host
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" /> Incomplete
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 items-center">
                  <Link to={`/sets/${s.setId}`} className="flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="gold"
                    size="sm"
                    className="flex-1 gap-1.5"
                    disabled={!s.isComplete}
                    title={
                      !s.isComplete
                        ? "Complete all questions before hosting"
                        : undefined
                    }
                    onClick={() =>
                      s.isComplete && navigate(`/sets/${s.setId}/host`)
                    }
                  >
                    <Tv2 className="w-3.5 h-3.5" />
                    Host
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSet(s.setId)}
                    disabled={deletingId === s.setId}
                    className="h-8 w-8 text-white/30 hover:text-red-400 hover:bg-red-900/20 shrink-0"
                  >
                    {deletingId === s.setId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
