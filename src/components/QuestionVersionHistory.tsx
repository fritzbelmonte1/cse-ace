import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Clock, User, GitBranch, ArrowLeft, Eye, RotateCcw, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { QuestionVersionComparison } from "./QuestionVersionComparison";
import { QuestionRollbackDialog } from "./QuestionRollbackDialog";

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
  changed_by: string | null;
  changed_at: string;
  change_type: string;
  change_summary: string | null;
}

interface Props {
  questionId: string;
  onClose: () => void;
  onRollback: () => void;
}

export const QuestionVersionHistory = ({ questionId, onClose, onRollback }: Props) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [compareMode, setCompareMode] = useState(false);
  const [selectedVersion1, setSelectedVersion1] = useState<Version | null>(null);
  const [selectedVersion2, setSelectedVersion2] = useState<Version | null>(null);
  const [rollbackVersion, setRollbackVersion] = useState<Version | null>(null);

  useEffect(() => {
    fetchVersions();
  }, [questionId]);

  const fetchVersions = async () => {
    try {
      const { data, error } = await supabase
        .from("question_versions")
        .select("*")
        .eq("question_id", questionId)
        .order("version_number", { ascending: false });

      if (error) throw error;

      setVersions(data || []);

      // Fetch user emails for audit trail
      const userIds = [...new Set(data?.map(v => v.changed_by).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: userData } = await supabase.functions.invoke('get-user-emails', {
          body: { userIds }
        });
        if (userData?.emails) {
          setUserEmails(userData.emails);
        }
      }
    } catch (error) {
      console.error("Error fetching versions:", error);
    } finally {
      setLoading(false);
    }
  };

  const getChangeTypeColor = (type: string) => {
    switch (type) {
      case "created": return "bg-blue-100 text-blue-800";
      case "updated": return "bg-yellow-100 text-yellow-800";
      case "status_changed": return "bg-purple-100 text-purple-800";
      case "rollback": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getChangeTypeIcon = (type: string) => {
    switch (type) {
      case "created": return "✨";
      case "updated": return "✏️";
      case "status_changed": return "🔄";
      case "rollback": return "⏮️";
      default: return "📝";
    }
  };

  if (compareMode && selectedVersion1 && selectedVersion2) {
    return (
      <QuestionVersionComparison
        version1={selectedVersion1}
        version2={selectedVersion2}
        onBack={() => {
          setCompareMode(false);
          setSelectedVersion1(null);
          setSelectedVersion2(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Version History
            </h3>
            <p className="text-sm text-muted-foreground">
              {versions.length} version{versions.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
        </div>
        
        {!compareMode && versions.length >= 2 && (
          <Button
            variant="outline"
            onClick={() => setCompareMode(true)}
            disabled={!selectedVersion1 || !selectedVersion2}
          >
            <Eye className="h-4 w-4 mr-2" />
            Compare Versions
          </Button>
        )}
      </div>

      {compareMode && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950">
          <p className="text-sm">
            Select two versions to compare. Click on version cards to select them.
          </p>
        </Card>
      )}

      <ScrollArea className="h-[600px] pr-4">
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8">Loading versions...</div>
          ) : versions.length === 0 ? (
            <Card className="p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No version history available</p>
            </Card>
          ) : (
            versions.map((version, index) => {
              const isLatest = index === 0;
              const isSelected = 
                selectedVersion1?.id === version.id || 
                selectedVersion2?.id === version.id;

              return (
                <Card
                  key={version.id}
                  className={`p-4 transition-all ${
                    compareMode 
                      ? "cursor-pointer hover:border-primary" 
                      : ""
                  } ${
                    isSelected ? "border-primary border-2 bg-primary/5" : ""
                  }`}
                  onClick={() => {
                    if (compareMode) {
                      if (!selectedVersion1) {
                        setSelectedVersion1(version);
                      } else if (!selectedVersion2 && version.id !== selectedVersion1.id) {
                        setSelectedVersion2(version);
                      } else if (selectedVersion1.id === version.id) {
                        setSelectedVersion1(null);
                      } else if (selectedVersion2?.id === version.id) {
                        setSelectedVersion2(null);
                      }
                    }
                  }}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          v{version.version_number}
                        </Badge>
                        {isLatest && (
                          <Badge className="bg-green-100 text-green-800">Current</Badge>
                        )}
                        <Badge className={getChangeTypeColor(version.change_type)}>
                          {getChangeTypeIcon(version.change_type)} {version.change_type}
                        </Badge>
                      </div>
                      
                      {!isLatest && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRollbackVersion(version);
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Rollback
                        </Button>
                      )}
                    </div>

                    {/* Change Summary */}
                    {version.change_summary && (
                      <p className="text-sm font-medium">{version.change_summary}</p>
                    )}

                    {/* Audit Info */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {version.changed_by ? userEmails[version.changed_by] || "Unknown" : "System"}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(version.changed_at), { addSuffix: true })}
                      </div>
                    </div>

                    <Separator />

                    {/* Question Preview */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium line-clamp-2">{version.question}</p>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div className={`p-1 rounded ${version.correct_answer === 'A' ? 'bg-green-50' : 'bg-gray-50'}`}>
                          A: {version.option_a.slice(0, 30)}...
                        </div>
                        <div className={`p-1 rounded ${version.correct_answer === 'B' ? 'bg-green-50' : 'bg-gray-50'}`}>
                          B: {version.option_b.slice(0, 30)}...
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="secondary">{version.module}</Badge>
                        <Badge variant="secondary">{version.status}</Badge>
                        {version.confidence_score && (
                          <Badge variant="secondary">
                            {Math.round(version.confidence_score * 100)}% confidence
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {rollbackVersion && (
        <QuestionRollbackDialog
          version={rollbackVersion}
          onConfirm={async () => {
            try {
              const { data, error } = await supabase.rpc('rollback_question_to_version', {
                p_question_id: questionId,
                p_version_number: rollbackVersion.version_number
              });

              if (error) throw error;

              onRollback();
              setRollbackVersion(null);
              fetchVersions();
            } catch (error) {
              console.error("Rollback error:", error);
            }
          }}
          onCancel={() => setRollbackVersion(null)}
        />
      )}
    </div>
  );
};
