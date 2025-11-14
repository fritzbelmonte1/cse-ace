import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Edit, Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Deck {
  id: string;
  name: string;
  description: string;
  module: string;
  is_public: boolean;
  created_at: string;
}

interface DeckManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeckCreated: () => void;
}

const modules = [
  { id: "vocabulary", name: "Vocabulary" },
  { id: "analogy", name: "Analogy" },
  { id: "reading", name: "Reading Comprehension" },
  { id: "numerical", name: "Numerical Ability" },
  { id: "clerical", name: "Clerical Ability" },
];

export const DeckManager = ({ open, onOpenChange, onDeckCreated }: DeckManagerProps) => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDeck, setEditingDeck] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedModule, setSelectedModule] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      loadDecks();
    }
  }, [open]);

  const loadDecks = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("flashcard_decks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDecks(data || []);
    } catch (error) {
      console.error("Error loading decks:", error);
      toast.error("Failed to load decks");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingDeck) {
        const { error } = await supabase
          .from("flashcard_decks")
          .update({ name, description, module: selectedModule, is_public: isPublic })
          .eq("id", editingDeck);

        if (error) throw error;
        toast.success("Deck updated successfully!");
      } else {
        const { error } = await supabase
          .from("flashcard_decks")
          .insert({
            user_id: user.id,
            name,
            description,
            module: selectedModule,
            is_public: isPublic,
          });

        if (error) throw error;
        toast.success("Deck created successfully!");
      }

      resetForm();
      loadDecks();
      onDeckCreated();
    } catch (error) {
      console.error("Error saving deck:", error);
      toast.error("Failed to save deck");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (deck: Deck) => {
    setEditingDeck(deck.id);
    setName(deck.name);
    setDescription(deck.description || "");
    setSelectedModule(deck.module);
    setIsPublic(deck.is_public);
  };

  const handleDelete = async (deckId: string) => {
    try {
      const { error } = await supabase
        .from("flashcard_decks")
        .delete()
        .eq("id", deckId);

      if (error) throw error;
      toast.success("Deck deleted");
      loadDecks();
      onDeckCreated();
    } catch (error) {
      console.error("Error deleting deck:", error);
      toast.error("Failed to delete deck");
    }
  };

  const resetForm = () => {
    setEditingDeck(null);
    setName("");
    setDescription("");
    setSelectedModule("");
    setIsPublic(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Decks</DialogTitle>
          <DialogDescription>
            Create and organize your flashcards into shareable collections
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">
              {editingDeck ? "Edit Deck" : "Create New Deck"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="deck-name">Deck Name</Label>
                <Input
                  id="deck-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Essential Vocabulary"
                  required
                />
              </div>

              <div>
                <Label htmlFor="deck-module">Module</Label>
                <Select value={selectedModule} onValueChange={setSelectedModule} required>
                  <SelectTrigger id="deck-module">
                    <SelectValue placeholder="Select a module" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map(module => (
                      <SelectItem key={module.id} value={module.id}>
                        {module.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="deck-description">Description (Optional)</Label>
                <Textarea
                  id="deck-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this deck..."
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="deck-public">Make Public</Label>
                  <p className="text-xs text-muted-foreground">
                    Share this deck with the community
                  </p>
                </div>
                <Switch
                  id="deck-public"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
              </div>

              <div className="flex gap-2">
                {editingDeck && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? "Saving..." : editingDeck ? "Update Deck" : "Create Deck"}
                </Button>
              </div>
            </form>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Your Decks</h3>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : decks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No decks yet. Create one to get started!
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {decks.map(deck => (
                  <Card key={deck.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-base">{deck.name}</CardTitle>
                            {deck.is_public && (
                              <Badge variant="secondary" className="text-xs">
                                <Globe className="h-3 w-3 mr-1" />
                                Public
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-xs">
                            {modules.find(m => m.id === deck.module)?.name}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(deck)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDelete(deck.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {deck.description && (
                      <CardContent className="pt-0 pb-3">
                        <p className="text-xs text-muted-foreground">{deck.description}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
