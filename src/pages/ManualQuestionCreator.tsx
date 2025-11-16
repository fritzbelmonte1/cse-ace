import { Navigation } from "@/components/Navigation";
import { ManualQuestionEditor } from "@/components/ManualQuestionEditor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function ManualQuestionCreator() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/questions")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Questions
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Manual Question Creator</h1>
          <p className="text-muted-foreground">
            Create questions manually or use AI to convert text into questions
          </p>
        </div>

        <ManualQuestionEditor />
        
        <Card className="mt-8 p-6 bg-blue-50 dark:bg-blue-950">
          <h3 className="font-bold text-lg mb-2">💡 Pro Tips</h3>
          <ul className="space-y-2 text-sm">
            <li>• <strong>Paste lecture notes:</strong> AI will extract key concepts and create questions</li>
            <li>• <strong>Copy exam material:</strong> Transform textbook content into practice questions</li>
            <li>• <strong>Import flashcards:</strong> Convert Q&A pairs into multiple-choice format</li>
            <li>• <strong>Review & edit:</strong> AI suggestions are a starting point - always review for accuracy</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
