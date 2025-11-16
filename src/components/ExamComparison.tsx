import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ExamComparisonProps {
  exam1: any;
  exam2: any;
}

export function ExamComparison({ exam1, exam2 }: ExamComparisonProps) {
  const score1 = Math.round((exam1.score / exam1.total_questions) * 100);
  const score2 = Math.round((exam2.score / exam2.total_questions) * 100);
  const scoreDiff = score2 - score1;

  const time1 = Math.round((exam1.time_spent_seconds || 0) / 60);
  const time2 = Math.round((exam2.time_spent_seconds || 0) / 60);
  const timeDiff = time2 - time1;

  const performance1 = exam1.question_performance || [];
  const performance2 = exam2.question_performance || [];

  const getChangeIcon = (diff: number) => {
    if (diff > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (diff < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getChangeColor = (diff: number) => {
    if (diff > 0) return "text-green-600";
    if (diff < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      {/* Summary Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Score Change</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{score1}% → {score2}%</div>
                <div className={`flex items-center gap-1 text-sm ${getChangeColor(scoreDiff)}`}>
                  {getChangeIcon(scoreDiff)}
                  {scoreDiff > 0 ? "+" : ""}{scoreDiff}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Time Change</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{time1}m → {time2}m</div>
                <div className={`flex items-center gap-1 text-sm ${getChangeColor(-timeDiff)}`}>
                  {getChangeIcon(-timeDiff)}
                  {timeDiff > 0 ? "+" : ""}{timeDiff}m
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {exam1.score}/{exam1.total_questions} → {exam2.score}/{exam2.total_questions}
                </div>
                <div className={`flex items-center gap-1 text-sm ${getChangeColor(exam2.score - exam1.score)}`}>
                  {getChangeIcon(exam2.score - exam1.score)}
                  {exam2.score - exam1.score > 0 ? "+" : ""}{exam2.score - exam1.score} questions
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Question-by-Question Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Question-by-Question Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {performance1.length === performance2.length ? (
              performance1.slice(0, 20).map((q1: any, idx: number) => {
                const q2 = performance2[idx];
                const improved = !q1.is_correct && q2.is_correct;
                const regressed = q1.is_correct && !q2.is_correct;
                const consistent = q1.is_correct === q2.is_correct;

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      improved ? "bg-green-50 border-green-200" :
                      regressed ? "bg-red-50 border-red-200" :
                      "bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-2">
                          Q{idx + 1}: {q1.question?.substring(0, 100)}...
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Exam 1:</span>
                            {q1.is_correct ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Correct
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Wrong
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">({q1.user_answer || "Skipped"})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Exam 2:</span>
                            {q2.is_correct ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Correct
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Wrong
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">({q2.user_answer || "Skipped"})</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        {improved && (
                          <Badge variant="outline" className="bg-green-100 text-green-700">
                            Improved
                          </Badge>
                        )}
                        {regressed && (
                          <Badge variant="outline" className="bg-red-100 text-red-700">
                            Regressed
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Cannot compare - exams have different number of questions
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
