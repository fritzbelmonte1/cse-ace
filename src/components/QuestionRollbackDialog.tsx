import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface Version {
  version_number: number;
  question: string;
  module: string;
  status: string;
  changed_at: string;
}

interface Props {
  version: Version;
  onConfirm: () => void;
  onCancel: () => void;
}

export const QuestionRollbackDialog = ({ version, onConfirm, onCancel }: Props) => {
  return (
    <AlertDialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Rollback to Version {version.version_number}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will restore the question to its state at version {version.version_number}.
            A new version entry will be created to track this rollback.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-4">
          <div>
            <p className="text-sm font-medium mb-1">Question Preview:</p>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {version.question}
            </p>
          </div>
          
          <div className="flex gap-2">
            <Badge variant="outline">{version.module}</Badge>
            <Badge variant="outline">{version.status}</Badge>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-orange-500 hover:bg-orange-600">
            Rollback Question
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
