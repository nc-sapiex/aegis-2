import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "@/lib/icons";

interface OverdueBannerProps {
  overdueCount: number;
}

export function OverdueBanner({ overdueCount }: OverdueBannerProps) {
  if (overdueCount === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Overdue Observations</AlertTitle>
      <AlertDescription>
        You have {overdueCount} overdue observation
        {overdueCount !== 1 ? "s" : ""} requiring immediate attention.
      </AlertDescription>
    </Alert>
  );
}
