import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Version {
  id: string;
  version_number: number;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  module: string;
  confidence_score: number | null;
  status: string;
  changed_at: string;
  change_type: string;
  change_summary: string | null;
}

interface Props {
  version1: Version;
  version2: Version;
  onBack: () => void;
}

export const QuestionVersionComparison = ({ version1, version2, onBack }: Props) => {
  const getDiff = (val1: string, val2: string) => {
    return val1 !== val2;
  };

  const DiffHighlight = ({ text, isDifferent }: { text: string; isDifferent: boolean }) => (
    <span className={isDifferent ? "bg-yellow-100 dark:bg-yellow-900 px-1 rounded" : ""}>
      {text}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-bold">Compare Versions</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Version 1 */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-mono">
                v{version1.version_number}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(version1.changed_at), { addSuffix: true })}
              </span>
            </div>
            
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Question</label>
                <p className="text-sm">
                  <DiffHighlight 
                    text={version1.question} 
                    isDifferent={getDiff(version1.question, version2.question)}
                  />
                </p>
              </div>

              <div className="grid grid-cols-1 gap-1">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Option A</label>
                  <p className={`text-sm p-2 rounded ${version1.correct_answer === 'A' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <DiffHighlight 
                      text={version1.option_a} 
                      isDifferent={getDiff(version1.option_a, version2.option_a)}
                    />
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Option B</label>
                  <p className={`text-sm p-2 rounded ${version1.correct_answer === 'B' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <DiffHighlight 
                      text={version1.option_b} 
                      isDifferent={getDiff(version1.option_b, version2.option_b)}
                    />
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Option C</label>
                  <p className={`text-sm p-2 rounded ${version1.correct_answer === 'C' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <DiffHighlight 
                      text={version1.option_c} 
                      isDifferent={getDiff(version1.option_c, version2.option_c)}
                    />
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Option D</label>
                  <p className={`text-sm p-2 rounded ${version1.correct_answer === 'D' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <DiffHighlight 
                      text={version1.option_d} 
                      isDifferent={getDiff(version1.option_d, version2.option_d)}
                    />
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Badge variant={getDiff(version1.module, version2.module) ? "default" : "secondary"}>
                  {version1.module}
                </Badge>
                <Badge variant={getDiff(version1.status, version2.status) ? "default" : "secondary"}>
                  {version1.status}
                </Badge>
                <Badge variant={getDiff(version1.correct_answer, version2.correct_answer) ? "default" : "secondary"}>
                  Answer: {version1.correct_answer}
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Version 2 */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-mono">
                v{version2.version_number}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(version2.changed_at), { addSuffix: true })}
              </span>
            </div>
            
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Question</label>
                <p className="text-sm">
                  <DiffHighlight 
                    text={version2.question} 
                    isDifferent={getDiff(version1.question, version2.question)}
                  />
                </p>
              </div>

              <div className="grid grid-cols-1 gap-1">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Option A</label>
                  <p className={`text-sm p-2 rounded ${version2.correct_answer === 'A' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <DiffHighlight 
                      text={version2.option_a} 
                      isDifferent={getDiff(version1.option_a, version2.option_a)}
                    />
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Option B</label>
                  <p className={`text-sm p-2 rounded ${version2.correct_answer === 'B' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <DiffHighlight 
                      text={version2.option_b} 
                      isDifferent={getDiff(version1.option_b, version2.option_b)}
                    />
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Option C</label>
                  <p className={`text-sm p-2 rounded ${version2.correct_answer === 'C' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <DiffHighlight 
                      text={version2.option_c} 
                      isDifferent={getDiff(version1.option_c, version2.option_c)}
                    />
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Option D</label>
                  <p className={`text-sm p-2 rounded ${version2.correct_answer === 'D' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <DiffHighlight 
                      text={version2.option_d} 
                      isDifferent={getDiff(version1.option_d, version2.option_d)}
                    />
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Badge variant={getDiff(version1.module, version2.module) ? "default" : "secondary"}>
                  {version2.module}
                </Badge>
                <Badge variant={getDiff(version1.status, version2.status) ? "default" : "secondary"}>
                  {version2.status}
                </Badge>
                <Badge variant={getDiff(version1.correct_answer, version2.correct_answer) ? "default" : "secondary"}>
                  Answer: {version2.correct_answer}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 bg-blue-50 dark:bg-blue-950">
        <div className="flex items-center gap-2 text-sm">
          <ArrowRight className="h-4 w-4" />
          <span className="font-medium">Legend:</span>
          <span className="bg-yellow-100 dark:bg-yellow-900 px-2 py-1 rounded text-xs">
            Highlighted text indicates differences between versions
          </span>
        </div>
      </Card>
    </div>
  );
};
