"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ENGAGEMENT_STATUS_STYLES } from "@/lib/constants";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";

interface EngagementRow {
  id: string;
  status: string;
  auditNumber?: string | null;
  auditType?: string | null;
  scheduledStartDate?: Date | string | null;
  actualEndDate?: Date | string | null;
  createdAt: Date | string;
  branch?: {
    id: string;
    name: string;
    code: string;
    city?: string | null;
  } | null;
  auditArea?: { id: string; name: string } | null;
  auditPlan?: { id: string; year: number; quarter: string } | null;
  teamMembers?: { user: { id: string; name: string } }[];
}

interface EngagementsTableProps {
  engagements: EngagementRow[];
}

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function EngagementsTable({ engagements }: EngagementsTableProps) {
  const router = useRouter();

  if (engagements.length === 0) {
    return (
      <EmptyStateCard
        variant="inline"
        title="No audit engagements yet"
        message='Create your first engagement from Audit Plans or click "Create Engagement" above.'
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Branch</TableHead>
            <TableHead className="hidden md:table-cell">Audit Area</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Start Date</TableHead>
            <TableHead className="hidden lg:table-cell">Plan</TableHead>
            <TableHead className="hidden md:table-cell">Team</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {engagements.map((engagement) => (
            <TableRow
              key={engagement.id}
              className="hover:bg-muted/50 cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/audit-execution/${engagement.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/audit-execution/${engagement.id}`);
                }
              }}
            >
              <TableCell>
                <div>
                  <p className="font-medium">
                    {engagement.branch?.name ?? "—"}
                  </p>
                  {engagement.auditNumber && (
                    <p className="text-muted-foreground text-xs">
                      {engagement.auditNumber}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {engagement.auditArea?.name ?? "—"}
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={ENGAGEMENT_STATUS_STYLES[engagement.status] ?? ""}
                >
                  {STATUS_LABELS[engagement.status] ?? engagement.status}
                </Badge>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {engagement.scheduledStartDate
                  ? formatDate(engagement.scheduledStartDate)
                  : "—"}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {engagement.auditPlan
                  ? `FY ${engagement.auditPlan.year} ${engagement.auditPlan.quarter.split("_")[0]}`
                  : "—"}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {engagement.teamMembers?.length ?? 0} members
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
