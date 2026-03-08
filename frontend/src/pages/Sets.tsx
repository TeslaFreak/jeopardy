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
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Tv2, Trash2, LayoutGrid, Loader2 } from "lucide-react";

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
    await apiFetch(`/sets/${setId}`, { method: "DELETE" });
    setSets((prev) => prev.filter((s) => s.setId !== setId));
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl font-bold text-white">
            My Game Sets
          </h1>
          <p className="text-white/50 mt-1 text-sm">
            {sets.length} set{sets.length !== 1 ? "s" : ""}
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
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-surface border border-white/10 flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-white/30" />
          </div>
          <p className="text-white/50 text-center">
            No sets yet. Create your first set to get started!
          </p>
          <Button variant="gold" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> Create First Set
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sets.map((s) => (
            <div
              key={s.setId}
              className="group rounded-2xl border border-white/10 bg-surface hover:border-gold/30 hover:bg-surface-2 transition-all duration-200 p-5 flex flex-col gap-4 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            >
              <div className="flex-1">
                <h3 className="font-display text-lg font-semibold text-white group-hover:text-gold transition-colors line-clamp-2">
                  {s.title}
                </h3>
                <p className="text-xs text-white/40 mt-1">
                  Updated {new Date(s.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant="board" className="w-fit">
                <LayoutGrid className="w-3 h-3 mr-1" />
                Question Set
              </Badge>
              <div className="flex gap-2 pt-1">
                <Link to={`/sets/${s.setId}`} className="flex-1">
                  <Button variant="board" size="sm" className="w-full gap-1.5">
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                </Link>
                <div className="flex-1">
                  <Button
                    variant="gold"
                    size="sm"
                    className="w-full gap-1.5"
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
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteSet(s.setId)}
                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
