import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, User, Clock, Layers } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface Deck {
  id: string;
  name: string;
  description: string;
  module: string;
  user_id: string;
  created_at: string;
  flashcard_count?: number;
}

const modules = [
  { id: "all", name: "All Modules" },
  { id: "vocabulary", name: "Vocabulary" },
  { id: "analogy", name: "Analogy" },
  { id: "reading", name: "Reading Comprehension" },
  { id: "numerical", name: "Numerical Ability" },
  { id: "clerical", name: "Clerical Ability" },
];

const BrowseDecks = () => {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState<string>("all");
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    loadPublicDecks();
  }, [filterModule]);

  const loadPublicDecks = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("flashcard_decks")
        .select("*, flashcards:flashcards(count)")
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      if (filterModule !== "all") {
        query = query.eq("module", filterModule);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Process the data to include flashcard count
      const decksWithCount = data?.map(deck => ({
        ...deck,
        flashcard_count: deck.flashcards?.[0]?.count || 0,
      })) || [];

      setDecks(decksWithCount);
    } catch (error) {
      console.error("Error loading public decks:", error);
      toast.error("Failed to load decks");
    } finally {
      setLoading(false);
    }
  };

  const handleImportDeck = async (deckId: string) => {
    setImporting(deckId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get all flashcards from the deck
      const { data: flashcards, error: fetchError } = await supabase
        .from("flashcards")
        .select("module, question, answer")
        .eq("deck_id", deckId);

      if (fetchError) throw fetchError;

      if (!flashcards || flashcards.length === 0) {
        throw new Error("No flashcards found in this deck");
      }

      // Copy flashcards to user's collection (without deck_id to keep them separate)
      const newFlashcards = flashcards.map(card => ({
        user_id: user.id,
        module: card.module,
        question: card.question,
        answer: card.answer,
      }));

      const { error: insertError } = await supabase
        .from("flashcards")
        .insert(newFlashcards);

      if (insertError) throw insertError;

      toast.success(`Imported ${flashcards.length} flashcards successfully!`);
    } catch (error: any) {
      console.error("Error importing deck:", error);
      toast.error(error.message || "Failed to import deck");
    } finally {
      setImporting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading public decks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/flashcards")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Flashcards
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Browse Community Decks</h1>
          <p className="text-muted-foreground">Discover and import flashcard collections from other users</p>
        </div>

        <div className="mb-6">
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Filter by module" />
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

        {decks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Public Decks Found</CardTitle>
              <CardDescription>
                Be the first to share a deck with the community!
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map(deck => (
              <Card key={deck.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <Badge variant="outline">
                      {modules.find(m => m.id === deck.module)?.name || deck.module}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Layers className="h-3 w-3" />
                      <span>{deck.flashcard_count} cards</span>
                    </div>
                  </div>
                  <CardTitle className="text-xl">{deck.name}</CardTitle>
                  {deck.description && (
                    <CardDescription className="line-clamp-2">
                      {deck.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>Community</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDistanceToNow(new Date(deck.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => handleImportDeck(deck.id)}
                    disabled={importing === deck.id}
                  >
                    {importing === deck.id ? (
                      <>Importing...</>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Import Deck
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowseDecks;
