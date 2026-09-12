import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/guards";
import { getObservationDetailForAuditee } from "@/data-access/auditee";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SEVERITY_COLORS, OBSERVATION_STATUS_COLORS } from "@/lib/constants";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { formatDate } from "@/lib/utils";
import {
  ChevronLeft,
  Eye,
  Shield,
  AlertTriangle,
  FileText,
  Clock,
  Calendar,
  MessageSquare,
  ExternalLink,
} from "@/lib/icons";
import Link from "next/link";
import { DeadlineBadge } from "@/components/auditee/deadline-badge";
import { StatusTimeline } from "@/components/findings/status-timeline";
import { EvidenceTimelineEntry } from "@/components/auditee/evidence-timeline-entry";
import { AuditeeDetailClient } from "./detail-client";

interface AuditeeObservationPageProps {
  params: Promise<{ id: string }>;
}

export default async function AuditeeObservationPage({
  params,
}: AuditeeObservationPageProps) {
  const { id: observationId } = await params;
  const session = await requirePermission("observation:read");

  const observation = await getObservationDetailForAuditee(
    session,
    observationId,
  );

  if (!observation) {
    notFound();
  }

  const isActive =
    observation.status === "ISSUED" || observation.status === "RESPONSE";

  const evidenceCount = observation.evidence?.length ?? 0;

  // Separate timeline entries: general vs evidence
  const generalTimeline = observation.timeline.filter(
    (e: any) => e.event !== "evidence_uploaded",
  );
  const evidenceTimeline = observation.timeline.filter(
    (e: any) => e.event === "evidence_uploaded",
  );

  const severityKey =
    observation.severity.toLowerCase() as keyof typeof SEVERITY_COLORS;
  const statusKey =
    observation.status.toUpperCase() as keyof typeof OBSERVATION_STATUS_COLORS;

  const effectiveDueDate = observation.responseDueDate ?? observation.dueDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <a
          href="/auditee"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Observations
        </a>

        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {observation.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={observation.severity} />
                <Badge
                  variant="outline"
                  className={OBSERVATION_STATUS_COLORS[statusKey] ?? ""}
                >
                  {observation.status}
                </Badge>
                {(observation.status === "RESPONSE" ||
                  observation.status === "COMPLIANCE" ||
                  observation.status === "CLOSED") && (
                  <Link
                    href="/compliance"
                    className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                  >
                    View Compliance Status
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
            <DeadlineBadge dueDate={effectiveDueDate ?? null} />
          </div>

          {/* Metadata row */}
          <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
            {observation.branch && (
              <span>
                Branch: <strong>{observation.branch.name}</strong>
              </span>
            )}
            {observation.auditArea && (
              <span>
                Audit Area: <strong>{observation.auditArea.name}</strong>
              </span>
            )}
            {observation.assignedTo && (
              <span>
                Auditor: <strong>{observation.assignedTo.name}</strong>
              </span>
            )}
            {observation.dueDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Due:{" "}
                {formatDate(
                  typeof observation.dueDate === "string"
                    ? observation.dueDate
                    : observation.dueDate.toISOString(),
                )}
              </span>
            )}
            {observation.responseDueDate && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Response Due:{" "}
                {formatDate(
                  typeof observation.responseDueDate === "string"
                    ? observation.responseDueDate
                    : observation.responseDueDate.toISOString(),
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 5C Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="text-muted-foreground h-4 w-4" />
            Condition
            <span className="text-muted-foreground text-xs font-normal">
              What was found
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{observation.condition}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="text-muted-foreground h-4 w-4" />
            Criteria
            <span className="text-muted-foreground text-xs font-normal">
              What should be
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{observation.criteria}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="text-muted-foreground h-4 w-4" />
            Cause
            <span className="text-muted-foreground text-xs font-normal">
              Why it happened
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{observation.cause}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="text-muted-foreground h-4 w-4" />
            Effect
            <span className="text-muted-foreground text-xs font-normal">
              Risk / Impact
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{observation.effect}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="text-muted-foreground h-4 w-4" />
            Recommendation
            <span className="text-muted-foreground text-xs font-normal">
              Suggested corrective action
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">
            {observation.recommendation}
          </p>
        </CardContent>
      </Card>

      {/* Metadata panel */}
      {(observation.riskCategory || observation.createdBy) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observation Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {observation.riskCategory && (
                <div>
                  <dt className="text-muted-foreground">Risk Category</dt>
                  <dd className="font-medium">{observation.riskCategory}</dd>
                </div>
              )}
              {observation.createdBy && (
                <div>
                  <dt className="text-muted-foreground">Created By</dt>
                  <dd className="font-medium">{observation.createdBy.name}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">
                  {formatDate(
                    typeof observation.createdAt === "string"
                      ? observation.createdAt
                      : observation.createdAt.toISOString(),
                  )}
                </dd>
              </div>
              {observation.version && (
                <div>
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="font-medium">v{observation.version}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Previous responses (read-only, chronological) */}
      {observation.auditeeResponses &&
        observation.auditeeResponses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="text-muted-foreground h-4 w-4" />
                Previous Responses
                <span className="text-muted-foreground text-xs font-normal">
                  ({observation.auditeeResponses.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {observation.auditeeResponses.map((response: any) => (
                <div
                  key={response.id}
                  className="rounded-md border bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-xs">
                      {response.responseType.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(
                        typeof response.createdAt === "string"
                          ? response.createdAt
                          : response.createdAt.toISOString(),
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">
                    {response.content}
                  </p>
                  {response.submittedBy && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Submitted by {response.submittedBy.name}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      {/* Response form + Evidence (client components) */}
      <AuditeeDetailClient
        observationId={observation.id}
        observationStatus={observation.status}
        evidence={observation.evidence ?? []}
        evidenceCount={evidenceCount}
        isActive={isActive}
      />

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="text-muted-foreground h-4 w-4" />
            Timeline
            <span className="text-muted-foreground text-xs font-normal">
              ({observation.timeline.length} events)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Full timeline with status + evidence events combined */}
          <StatusTimeline entries={generalTimeline} />

          {/* Evidence events */}
          {evidenceTimeline.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Evidence Activity
              </h4>
              {evidenceTimeline.map((entry: any) => (
                <EvidenceTimelineEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
