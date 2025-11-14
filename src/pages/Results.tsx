import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Home } from "lucide-react";

const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { score, total, answers, questions } = location.state || {};

  if (!score && score !== 0) {
    navigate("/dashboard");
    return null;
  }

  const percentage = Math.round((score / total) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="container max-w-4xl mx-auto py-8">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold">Test Results</CardTitle>
            <CardDescription>Here's how you performed</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="mb-6">
              <div className="text-6xl font-bold text-primary mb-2">{percentage}%</div>
              <div className="text-xl text-muted-foreground">
                {score} out of {total} correct
              </div>
            </div>
            <Button onClick={() => navigate("/dashboard")}>
              <Home className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-4">Answer Review</h2>
          {questions?.map((question: any, index: number) => {
            const options = JSON.parse(question.options);
            const userAnswer = answers[index];
            const isCorrect = userAnswer === question.correct_answer;

            return (
              <Card key={index} className={isCorrect ? "border-green-500" : "border-red-500"}>
                <CardHeader>
                  <div className="flex items-start gap-3">
                    {isCorrect ? (
                      <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                      <CardDescription className="mt-2">{question.question_text}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {options.map((option: string, optIndex: number) => {
                    const isUserAnswer = userAnswer === optIndex;
                    const isCorrectAnswer = question.correct_answer === optIndex;

                    return (
                      <div
                        key={optIndex}
                        className={`p-3 rounded-lg border ${
                          isCorrectAnswer
                            ? "bg-green-50 border-green-500 dark:bg-green-950"
                            : isUserAnswer
                            ? "bg-red-50 border-red-500 dark:bg-red-950"
                            : "bg-muted"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isCorrectAnswer && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {isUserAnswer && !isCorrectAnswer && <XCircle className="h-4 w-4 text-red-500" />}
                          <span>{option}</span>
                        </div>
                      </div>
                    );
                  })}
                  {question.explanation && (
                    <div className="mt-4 p-3 bg-accent rounded-lg">
                      <p className="text-sm font-medium mb-1">Explanation:</p>
                      <p className="text-sm text-muted-foreground">{question.explanation}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Results;