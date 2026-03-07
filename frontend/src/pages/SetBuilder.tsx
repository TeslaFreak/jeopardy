import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Tv2, Plus, X, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Question {
  value: 100 | 200 | 300 | 400 | 500;
  clue: string;
  answer: string;
}

interface Category {
  name: string;
  slug: string;
  questions: Question[];
}

interface GameSet {
  setId: string;
  title: string;
  categories: Category[];
}

const VALUES: Question["value"][] = [100, 200, 300, 400, 500];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function SetBuilder() {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [editingQ, setEditingQ] = useState<{
    catSlug: string;
    value: number;
  } | null>(null);
  const [qForm, setQForm] = useState({ clue: "", answer: "" });
  const [newCatName, setNewCatName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<GameSet>(`/sets/${setId}`)
      .then(setGameSet)
      .finally(() => setLoading(false));
  }, [setId]);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const slug = slugify(newCatName);
    const cat: Category = { name: newCatName.trim(), slug, questions: [] };
    await apiFetch(`/sets/${setId}/categories`, {
      method: "POST",
      body: JSON.stringify(cat),
    });
    setGameSet((prev) =>
      prev ? { ...prev, categories: [...prev.categories, cat] } : prev,
    );
    setNewCatName("");
  }

  async function deleteCategory(slug: string) {
    if (!confirm("Delete this category and all its questions?")) return;
    await apiFetch(`/sets/${setId}/categories/${slug}`, { method: "DELETE" });
    setGameSet((prev) =>
      prev
        ? {
            ...prev,
            categories: prev.categories.filter((c) => c.slug !== slug),
          }
        : prev,
    );
  }

  function openQuestionEditor(catSlug: string, value: number) {
    const cat = gameSet?.categories.find((c) => c.slug === catSlug);
    const existing = cat?.questions.find((q) => q.value === value);
    setQForm({ clue: existing?.clue ?? "", answer: existing?.answer ?? "" });
    setEditingQ({ catSlug, value });
  }

  async function saveQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!editingQ || !gameSet) return;
    setSaving(true);
    const cat = gameSet.categories.find((c) => c.slug === editingQ.catSlug)!;
    const newQuestions: Question[] = [
      ...cat.questions.filter((q) => q.value !== editingQ.value),
      {
        value: editingQ.value as Question["value"],
        clue: qForm.clue,
        answer: qForm.answer,
      },
    ].sort((a, b) => a.value - b.value);
    const updatedCat: Category = { ...cat, questions: newQuestions };
    await apiFetch(`/sets/${setId}/categories/${editingQ.catSlug}`, {
      method: "PUT",
      body: JSON.stringify(updatedCat),
    });
    setGameSet((prev) =>
      prev
        ? {
            ...prev,
            categories: prev.categories.map((c) =>
              c.slug === editingQ.catSlug ? updatedCat : c,
            ),
          }
        : prev,
    );
    setEditingQ(null);
    setSaving(false);
  }

  const editingCatName = editingQ
    ? gameSet?.categories.find((c) => c.slug === editingQ.catSlug)?.name
    : null;

  const totalQuestions =
    gameSet?.categories.reduce((sum, c) => sum + c.questions.length, 0) ?? 0;
  const totalPossible = (gameSet?.categories.length ?? 0) * VALUES.length;

  const isComplete =
    (gameSet?.categories.length ?? 0) > 0 &&
    totalQuestions === totalPossible &&
    (gameSet?.categories ?? []).every((cat) =>
      VALUES.every((val) => {
        const q = cat.questions.find((q) => q.value === val);
        return q && q.clue.trim() && q.answer.trim();
      }),
    );

  if (loading || !gameSet) {
    return (
      <div className="flex items-center justify-center h-64 text-white/40">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <Link to="/sets">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="w-4 h-4" /> My Sets
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-3xl font-bold text-white truncate">
            {gameSet.title}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="board">
              {gameSet.categories.length} categories
            </Badge>
            <Badge
              variant={
                totalQuestions === totalPossible && totalPossible > 0
                  ? "success"
                  : "muted"
              }
            >
              {totalQuestions}/{totalPossible} questions
            </Badge>
          </div>
          {!isComplete && totalPossible > 0 && (
            <p className="text-xs text-amber-400/80 mt-1">
              Fill in all questions to enable hosting.
            </p>
          )}
        </div>
        <Button
          variant="gold"
          size="lg"
          disabled={!isComplete}
          title={
            !isComplete ? "Complete all questions before hosting" : undefined
          }
          onClick={() => navigate(`/sets/${setId}/host`)}
        >
          <Tv2 className="w-4 h-4" />
          Host Game
        </Button>
      </div>

      {/* Board */}
      {gameSet.categories.length > 0 ? (
        <div className="overflow-x-auto mb-8 rounded-xl border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <table
            className="w-full border-collapse"
            style={{ minWidth: `${gameSet.categories.length * 140}px` }}
          >
            <thead>
              <tr>
                {gameSet.categories.map((cat) => (
                  <th
                    key={cat.slug}
                    className="bg-board border-b-2 border-black/30 px-3 py-4 text-center"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-display font-semibold text-sm text-white uppercase tracking-wider leading-tight">
                        {cat.name}
                      </span>
                      <button
                        onClick={() => deleteCategory(cat.slug)}
                        className="text-white/30 hover:text-red-400 transition-colors shrink-0"
                        title="Delete category"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VALUES.map((val) => (
                <tr key={val}>
                  {gameSet.categories.map((cat) => {
                    const q = cat.questions.find((q) => q.value === val);
                    return (
                      <td
                        key={cat.slug}
                        onClick={() => openQuestionEditor(cat.slug, val)}
                        className={cn(
                          "border border-black/40 text-center cursor-pointer transition-all duration-150 h-20",
                          q
                            ? "bg-board hover:bg-board-hover"
                            : "bg-navy-3 hover:bg-navy-2",
                        )}
                      >
                        {q ? (
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className="font-display font-bold text-2xl text-gold">
                              ${val}
                            </span>
                            <CheckCircle2 className="w-3 h-3 text-gold/50" />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className="font-display text-gold/40 text-lg font-bold">
                              ${val}
                            </span>
                            <span className="text-xs text-white/20">+ Add</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-surface p-12 text-center mb-8">
          <p className="text-white/40 text-lg">
            Add your first category below to start building the board.
          </p>
        </div>
      )}

      {/* Add Category */}
      <form onSubmit={addCategory} className="flex gap-2 max-w-md">
        <Input
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          placeholder="New category name (e.g. US History)…"
          className="flex-1"
        />
        <Button type="submit" variant="board" disabled={!newCatName.trim()}>
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </form>

      {/* Question Editor Modal */}
      <Dialog
        open={!!editingQ}
        onOpenChange={(o) => {
          if (!o) setEditingQ(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCatName}
              <span className="text-gold ml-2 font-display">
                ${editingQ?.value}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveQuestion} className="flex flex-col gap-4 mt-2">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1.5">
                Clue{" "}
                <span className="text-white/40 font-normal">
                  (what players see)
                </span>
              </label>
              <textarea
                value={qForm.clue}
                onChange={(e) =>
                  setQForm((f) => ({ ...f, clue: e.target.value }))
                }
                rows={3}
                className="w-full rounded-lg border border-white/20 bg-navy-3 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/60 transition-colors resize-none"
                placeholder="This U.S. state is known as the Sunshine State."
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1.5">
                Answer
              </label>
              <Input
                value={qForm.answer}
                onChange={(e) =>
                  setQForm((f) => ({ ...f, answer: e.target.value }))
                }
                placeholder="What is Florida?"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingQ(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="gold"
                disabled={saving || !qForm.clue.trim() || !qForm.answer.trim()}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Save Question"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
