import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, ClipboardList } from "@/lib/icons";
import { SEVERITY_COLORS } from "@/lib/constants";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { getRecommendations } from "@/lib/report-utils";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

const recommendations = getRecommendations();

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
};

export function RecommendationsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5" />
          Recommendations
        </CardTitle>
        <CardDescription>
          Prioritized action items for board consideration -{" "}
          {recommendations.length} recommendation(s)
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ol className="space-y-0">
          {recommendations.map((rec, index) => (
            <li key={`${rec.priority}-${rec.title}`}>
              {index > 0 && <Separator className="my-4" />}

              <div className="space-y-2">
                {/* Priority badge and title */}
                <div className="flex items-start gap-3">
                  <span className="text-muted-foreground mt-0.5 text-base font-bold tabular-nums">
                    {index + 1}.
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge
                        severity={rec.priority}
                        label={PRIORITY_LABEL[rec.priority] || rec.priority}
                      />
                      <span className="text-base font-semibold">
                        {rec.title}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-muted-foreground text-base">
                      {rec.description}
                    </p>

                    {/* Related findings */}
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        Related findings:
                      </span>
                      {rec.relatedFindingIds.map((id) => (
                        <Link
                          key={id}
                          href={`/findings/${id}`}
                          className="text-primary font-mono text-sm hover:underline"
                        >
                          {id}
                        </Link>
                      ))}
                    </div>

                    {/* Target date */}
                    <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <Calendar className="h-3.5 w-3.5" />
                      Target: {formatDate(rec.targetDate)}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
