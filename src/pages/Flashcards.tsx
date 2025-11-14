import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Brain, RotateCcw, Trash2, CheckCircle, XCircle, BookOpen, Download, FolderOpen, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { FlashcardImport } from "@/components/FlashcardImport";
import { DeckManager } from "@/components/DeckManager";

interface Flashcard {
  id: string;
  module: string;
  question: string;
  answer: string;
  difficulty: number;
  created_at: string;
}

interface FlashcardReview {
  id: string;
  flashcard_id: string;
  next_review_date: string;
  interval_days: number;
  ease_factor: number;
  repetition_number: number;
}

const modules = [
  { id: "vocabulary", name: "Vocabulary" },
  { id: "analogy", name: "Analogy" },
  { id: "reading", name: "Reading Comprehension" },
  { id: "numerical", name: "Numerical Ability" },
  { id: "clerical", name: "Clerical Ability" },
];

// SM-2 Spaced Repetition Algorithm
const calculateNextReview = (quality: number, review?: FlashcardReview) => {
  // quality: 0-5 (0=complete blackout, 5=perfect response)
  const currentEaseFactor = review?.ease_factor || 2.5;
  const currentInterval = review?.interval_days || 0;
  const currentRepetition = review?.repetition_number || 0;

  let newEaseFactor = currentEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  let newInterval: number;
  let newRepetition: number;

  if (quality < 3) {
    // Failed recall - reset
    newInterval = 1;
    newRepetition = 0;
  } else {
    if (currentRepetition === 0) {
      newInterval = 1;
    } else if (currentRepetition === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(currentInterval * newEaseFactor);
    }
    newRepetition = currentRepetition + 1;
  }

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return {
    interval_days: newInterval,
    ease_factor: newEaseFactor,
    repetition_number: newRepetition,
    next_review_date: nextReviewDate.toISOString(),
  };
};

const Flashcards = () => {
  const navigate = useNavigate();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [reviews, setReviews] = useState<Record<string, FlashcardReview>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deckManagerOpen, setDeckManagerOpen] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  
  // Form state
  const [selectedModule, setSelectedModule] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterModule, setFilterModule] = useState<string>("all");

  useEffect(() => {
    loadFlashcards();
  }, []);

  const loadFlashcards = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: cardsData, error: cardsError } = await supabase
      .from("flashcards")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (cardsError) {
      console.error("Error loading flashcards:", cardsError);
      toast.error("Failed to load flashcards");
    } else {
      setFlashcards(cardsData || []);
    }

    const { data: reviewsData, error: reviewsError } = await supabase
      .from("flashcard_reviews")
      .select("*")
      .eq("user_id", user.id);

    if (reviewsError) {
      console.error("Error loading reviews:", reviewsError);
    } else {
      const reviewsMap: Record<string, FlashcardReview> = {};
      reviewsData?.forEach(review => {
        reviewsMap[review.flashcard_id] = review;
      });
      setReviews(reviewsMap);

      // Find due cards
      const now = new Date();
      const due = cardsData?.filter(card => {
        const review = reviewsMap[card.id];
        if (!review) return true; // New cards are always due
        return new Date(review.next_review_date) <= now;
      }) || [];
      setDueCards(due);
    }

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("flashcards").insert({
        user_id: user.id,
        module: selectedModule,
        question,
        answer,
      });

      if (error) throw error;

      toast.success("Flashcard created!");
      setDialogOpen(false);
      resetForm();
      loadFlashcards();
    } catch (error) {
      console.error("Error creating flashcard:", error);
      toast.error("Failed to create flashcard");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedModule("");
    setQuestion("");
    setAnswer("");
  };

  const handleDelete = async (flashcardId: string) => {
    try {
      const { error } = await supabase
        .from("flashcards")
        .delete()
        .eq("id", flashcardId);

      if (error) throw error;

      toast.success("Flashcard deleted");
      loadFlashcards();
    } catch (error) {
      console.error("Error deleting flashcard:", error);
      toast.error("Failed to delete flashcard");
    }
  };

  const startStudySession = () => {
    if (dueCards.length === 0) {
      toast.error("No flashcards due for review");
      return;
    }
    setStudyMode(true);
    setCurrentCardIndex(0);
    setIsFlipped(false);
  };

  const handleReview = async (quality: number) => {
    try {
      const currentCard = dueCards[currentCardIndex];
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const currentReview = reviews[currentCard.id];
      const nextReviewData = calculateNextReview(quality, currentReview);

      const { error } = await supabase.from("flashcard_reviews").insert({
        user_id: user.id,
        flashcard_id: currentCard.id,
        quality,
        ...nextReviewData,
      });

      if (error) throw error;

      // Move to next card
      if (currentCardIndex < dueCards.length - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
        setIsFlipped(false);
      } else {
        toast.success("Study session complete! 🎉");
        setStudyMode(false);
        loadFlashcards();
      }
    } catch (error) {
      console.error("Error recording review:", error);
      toast.error("Failed to record review");
    }
  };

  const filteredCards = filterModule === "all" 
    ? flashcards 
    : flashcards.filter(card => card.module === filterModule);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading flashcards...</p>
        </div>
      </div>
    );
  }

  if (studyMode && dueCards.length > 0) {
    const currentCard = dueCards[currentCardIndex];
    const progress = ((currentCardIndex + 1) / dueCards.length) * 100;

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={() => setStudyMode(false)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Exit Study Mode
            </Button>
            <div className="text-sm text-muted-foreground">
              {currentCardIndex + 1} / {dueCards.length}
            </div>
          </div>

          <div className="mb-4">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow min-h-[400px] flex flex-col"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <CardHeader>
              <Badge className="w-fit mb-2">
                {modules.find(m => m.id === currentCard.module)?.name}
              </Badge>
              <CardTitle className="text-center">
                {isFlipped ? "Answer" : "Question"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex items-center justify-center">
              <p className="text-xl text-center">
                {isFlipped ? currentCard.answer : currentCard.question}
              </p>
            </CardContent>
          </Card>

          {isFlipped && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-center text-muted-foreground mb-4">
                How well did you remember this?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => handleReview(0)}
                  className="h-auto py-4 flex flex-col gap-2"
                >
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span>Forgot</span>
                  <span className="text-xs text-muted-foreground">Review tomorrow</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleReview(3)}
                  className="h-auto py-4 flex flex-col gap-2"
                >
                  <RotateCcw className="h-5 w-5 text-yellow-600" />
                  <span>Hard</span>
                  <span className="text-xs text-muted-foreground">Review in 3 days</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleReview(4)}
                  className="h-auto py-4 flex flex-col gap-2"
                >
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                  <span>Good</span>
                  <span className="text-xs text-muted-foreground">Review in 6 days</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleReview(5)}
                  className="h-auto py-4 flex flex-col gap-2"
                >
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Easy</span>
                  <span className="text-xs text-muted-foreground">Review in 10+ days</span>
                </Button>
              </div>
            </div>
          )}

          {!isFlipped && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              Click card to reveal answer
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/browse-decks")}>
              <Users className="mr-2 h-4 w-4" />
              Browse Community
            </Button>
            <Button variant="outline" onClick={() => setDeckManagerOpen(true)}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Manage Decks
            </Button>
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Import
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Flashcard
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Flashcard</DialogTitle>
                <DialogDescription>
                  Add a new flashcard for spaced repetition learning
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="module">Module</Label>
                    <Select value={selectedModule} onValueChange={setSelectedModule} required>
                      <SelectTrigger>
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
                    <Label htmlFor="question">Question / Front</Label>
                    <Textarea
                      id="question"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="e.g., What does 'ubiquitous' mean?"
                      rows={3}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="answer">Answer / Back</Label>
                    <Textarea
                      id="answer"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="e.g., Present, appearing, or found everywhere"
                      rows={3}
                      required
                    />
                  </div>
                </div>

                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating..." : "Create Flashcard"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <FlashcardImport
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onSuccess={loadFlashcards}
        />

        <DeckManager
          open={deckManagerOpen}
          onOpenChange={setDeckManagerOpen}
          onDeckCreated={loadFlashcards}
        />

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Flashcards</h1>
          <p className="text-muted-foreground">Master concepts with spaced repetition learning</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Due for Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{dueCards.length}</div>
              <Button 
                className="w-full mt-4" 
                onClick={startStudySession}
                disabled={dueCards.length === 0}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Start Studying
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Flashcards</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{flashcards.length}</div>
              <p className="text-sm text-muted-foreground mt-2">
                Across all modules
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mastered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {Object.values(reviews).filter(r => r.interval_days >= 21).length}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                21+ day intervals
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-4">
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Filter by module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {modules.map(module => (
                <SelectItem key={module.id} value={module.id}>
                  {module.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredCards.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Flashcards Yet</CardTitle>
              <CardDescription>
                Create your first flashcard to start learning with spaced repetition
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Flashcard
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCards.map(card => {
              const review = reviews[card.id];
              const isDue = !review || new Date(review.next_review_date) <= new Date();

              return (
                <Card key={card.id} className={isDue ? "border-primary" : ""}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <Badge variant="outline">
                        {modules.find(m => m.id === card.module)?.name}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(card.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Question:</p>
                      <p className="text-sm font-medium line-clamp-2">{card.question}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Answer:</p>
                      <p className="text-sm line-clamp-2">{card.answer}</p>
                    </div>
                    {review && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          {isDue ? (
                            <span className="text-primary font-medium">Due for review</span>
                          ) : (
                            <>Next review: {new Date(review.next_review_date).toLocaleDateString()}</>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Interval: {review.interval_days} days
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Flashcards;
