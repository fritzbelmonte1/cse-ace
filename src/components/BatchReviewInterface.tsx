import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Search, 
  Filter,
  ArrowUpDown,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  module: string;
  confidence_score: number;
  status: string;
  document_id: string;
  created_at: string;
  // Phase 2 context fields
  document_section?: string | null;
  page_number?: number | null;
  question_number?: string | null;
  preceding_context?: string | null;
  quality?: {
    questionClarity: number;
    optionQuality: number;
    answerCertainty: number;
    formattingScore: number;
    overallQuality: number;
    needsReview: boolean;
    reviewReasons: string[];
  };
}

interface BatchReviewInterfaceProps {
  questions: Question[];
  selectedQuestions: Set<string>;
  onToggleQuestion: (id: string) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onQuickEdit: (question: Question) => void;
}

export function BatchReviewInterface({
  questions,
  selectedQuestions,
  onToggleQuestion,
  onBulkApprove,
  onBulkReject,
  onQuickEdit
}: BatchReviewInterfaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [reviewReasonFilter, setReviewReasonFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("quality-desc");

  // Extract unique review reasons
  const reviewReasons = useMemo(() => {
    const reasons = new Set<string>();
    questions.forEach(q => {
      q.quality?.reviewReasons.forEach(r => reasons.add(r));
    });
    return Array.from(reasons);
  }, [questions]);

  // Filter and sort questions
  const filteredQuestions = useMemo(() => {
    let filtered = questions;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(q => 
        q.question.toLowerCase().includes(query) ||
        q.option_a.toLowerCase().includes(query) ||
        q.option_b.toLowerCase().includes(query) ||
        q.option_c.toLowerCase().includes(query) ||
        q.option_d.toLowerCase().includes(query)
      );
    }

    // Quality filter
    if (qualityFilter !== "all") {
      if (qualityFilter === "high") {
        filtered = filtered.filter(q => (q.quality?.overallQuality || 0) >= 0.85);
      } else if (qualityFilter === "medium") {
        filtered = filtered.filter(q => {
          const quality = q.quality?.overallQuality || 0;
          return quality >= 0.70 && quality < 0.85;
        });
      } else if (qualityFilter === "low") {
        filtered = filtered.filter(q => (q.quality?.overallQuality || 0) < 0.70);
      }
    }

    // Review reason filter
    if (reviewReasonFilter !== "all") {
      filtered = filtered.filter(q => 
        q.quality?.reviewReasons.includes(reviewReasonFilter)
      );
    }

    // Sort
    const sorted = [...filtered];
    if (sortBy === "quality-desc") {
      sorted.sort((a, b) => (b.quality?.overallQuality || 0) - (a.quality?.overallQuality || 0));
    } else if (sortBy === "quality-asc") {
      sorted.sort((a, b) => (a.quality?.overallQuality || 0) - (b.quality?.overallQuality || 0));
    } else if (sortBy === "confidence-desc") {
      sorted.sort((a, b) => b.confidence_score - a.confidence_score);
    } else if (sortBy === "needs-review") {
      sorted.sort((a, b) => {
        if (a.quality?.needsReview && !b.quality?.needsReview) return -1;
        if (!a.quality?.needsReview && b.quality?.needsReview) return 1;
        return 0;
      });
    }

    return sorted;
  }, [questions, searchQuery, qualityFilter, reviewReasonFilter, sortBy]);

  const stats = useMemo(() => {
    const total = filteredQuestions.length;
    const selected = filteredQuestions.filter(q => selectedQuestions.has(q.id)).length;
    const highQuality = filteredQuestions.filter(q => (q.quality?.overallQuality || 0) >= 0.85).length;
    const needsReview = filteredQuestions.filter(q => q.quality?.needsReview).length;
    
    return { total, selected, highQuality, needsReview };
  }, [filteredQuestions, selectedQuestions]);

  const selectAllFiltered = () => {
    filteredQuestions.forEach(q => {
      if (!selectedQuestions.has(q.id)) {
        onToggleQuestion(q.id);
      }
    });
  };

  const deselectAll = () => {
    filteredQuestions.forEach(q => {
      if (selectedQuestions.has(q.id)) {
        onToggleQuestion(q.id);
      }
    });
  };

  const getQualityBadge = (quality: number) => {
    if (quality >= 0.85) {
      return <Badge className="bg-green-500">High Quality</Badge>;
    } else if (quality >= 0.70) {
      return <Badge className="bg-yellow-500">Medium Quality</Badge>;
    } else {
      return <Badge variant="destructive">Low Quality</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Questions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{stats.selected}</div>
              <div className="text-sm text-muted-foreground">Selected</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{stats.highQuality}</div>
              <div className="text-sm text-muted-foreground">High Quality</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{stats.needsReview}</div>
              <div className="text-sm text-muted-foreground">Needs Review</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters & Actions Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={qualityFilter} onValueChange={setQualityFilter}>
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Quality Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Quality</SelectItem>
                  <SelectItem value="high">High Quality (≥85%)</SelectItem>
                  <SelectItem value="medium">Medium Quality (70-85%)</SelectItem>
                  <SelectItem value="low">Low Quality (&lt;70%)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={reviewReasonFilter} onValueChange={setReviewReasonFilter}>
                <SelectTrigger>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Review Reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Issues</SelectItem>
                  {reviewReasons.map(reason => (
                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quality-desc">Quality (High → Low)</SelectItem>
                  <SelectItem value="quality-asc">Quality (Low → High)</SelectItem>
                  <SelectItem value="confidence-desc">Confidence (High → Low)</SelectItem>
                  <SelectItem value="needs-review">Needs Review First</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllFiltered}
                disabled={stats.total === 0}
              >
                Select All Filtered ({stats.total})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={deselectAll}
                disabled={stats.selected === 0}
              >
                Deselect All
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={onBulkApprove}
                disabled={stats.selected === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve Selected ({stats.selected})
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onBulkReject}
                disabled={stats.selected === 0}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject Selected ({stats.selected})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions List */}
      <div className="space-y-3">
        {filteredQuestions.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No questions match your filters
            </CardContent>
          </Card>
        ) : (
          filteredQuestions.map((question) => (
            <Card
              key={question.id}
              className={cn(
                "transition-colors",
                selectedQuestions.has(question.id) && "border-blue-500 bg-blue-50 dark:bg-blue-950"
              )}
            >
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  {/* Checkbox */}
                  <Checkbox
                    checked={selectedQuestions.has(question.id)}
                    onCheckedChange={() => onToggleQuestion(question.id)}
                    className="mt-1"
                  />

                  {/* Content */}
                  <div className="flex-1 space-y-3">
                    {/* Header with badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium">{question.question}</p>
                        
                        {/* Phase 2: Context Information */}
                        {(question.document_section || question.page_number || question.question_number) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {question.document_section && (
                              <Badge variant="secondary" className="text-xs">
                                📚 {question.document_section}
                              </Badge>
                            )}
                            {question.page_number && (
                              <Badge variant="secondary" className="text-xs">
                                📄 Page {question.page_number}
                              </Badge>
                            )}
                            {question.question_number && (
                              <Badge variant="secondary" className="text-xs">
                                🔢 {question.question_number}
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        {/* Preceding Context */}
                        {question.preceding_context && (
                          <div className="mt-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground border border-border/50">
                            <span className="font-medium">Context: </span>
                            {question.preceding_context.substring(0, 150)}
                            {question.preceding_context.length > 150 && '...'}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {question.quality && getQualityBadge(question.quality.overallQuality)}
                        {question.quality?.needsReview && (
                          <Badge variant="outline" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Review
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Options Grid */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className={cn(
                        "p-2 rounded border",
                        question.correct_answer === 'A' && "border-green-500 bg-green-50 dark:bg-green-950"
                      )}>
                        <span className="font-semibold">A:</span> {question.option_a}
                      </div>
                      <div className={cn(
                        "p-2 rounded border",
                        question.correct_answer === 'B' && "border-green-500 bg-green-50 dark:bg-green-950"
                      )}>
                        <span className="font-semibold">B:</span> {question.option_b}
                      </div>
                      <div className={cn(
                        "p-2 rounded border",
                        question.correct_answer === 'C' && "border-green-500 bg-green-50 dark:bg-green-950"
                      )}>
                        <span className="font-semibold">C:</span> {question.option_c}
                      </div>
                      <div className={cn(
                        "p-2 rounded border",
                        question.correct_answer === 'D' && "border-green-500 bg-green-50 dark:bg-green-950"
                      )}>
                        <span className="font-semibold">D:</span> {question.option_d}
                      </div>
                    </div>

                    {/* Quality Metrics */}
                    {question.quality && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">
                          Clarity: {Math.round(question.quality.questionClarity * 100)}%
                        </Badge>
                        <Badge variant="outline">
                          Options: {Math.round(question.quality.optionQuality * 100)}%
                        </Badge>
                        <Badge variant="outline">
                          Answer: {Math.round(question.quality.answerCertainty * 100)}%
                        </Badge>
                        <Badge variant="outline">
                          Format: {Math.round(question.quality.formattingScore * 100)}%
                        </Badge>
                      </div>
                    )}

                    {/* Review Reasons */}
                    {question.quality?.reviewReasons && question.quality.reviewReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {question.quality.reviewReasons.map((reason, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onQuickEdit(question)}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Quick Edit
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
