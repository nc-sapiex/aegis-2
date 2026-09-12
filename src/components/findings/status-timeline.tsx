import { formatDate } from "@/lib/utils";
import {
  ArrowRight,
  AlertTriangle,
  Copy,
  Plus,
  CheckCircle2,
  MessageSquare,
} from "@/lib/icons";

interface TimelineEntry {
  id: string;
  event: string;
  oldValue: string | null;
  newValue: string | null;
  comment: string | null;
  createdBy: { name: string };
  createdAt: Date | string;
}

interface StatusTimelineProps {
  entries: TimelineEntry[];
}

const EVENT_CONFIG: Record<
  string,
  { color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  created: { color: "border-emerald-500 bg-emerald-500", icon: Plus },
  status_changed: { color: "border-blue-500 bg-blue-500", icon: ArrowRight },
  severity_escalated: {
    color: "border-orange-500 bg-orange-500",
    icon: AlertTriangle,
  },
  repeat_confirmed: { color: "border-red-500 bg-red-500", icon: Copy },
  repeat_dismissed: {
    color: "border-slate-400 bg-slate-400",
    icon: MessageSquare,
  },
  resolved_during_fieldwork: {
    color: "border-amber-500 bg-amber-500",
    icon: CheckCircle2,
  },
};

const DEFAULT_CONFIG = {
  color: "border-slate-400 bg-slate-400",
  icon: ArrowRight,
};

function getEventDescription(entry: TimelineEntry): string {
  switch (entry.event) {
    case "created":
      return "Observation created";
    case "status_changed":
      return entry.oldValue && entry.newValue
        ? `${entry.oldValue} \u2192 ${entry.newValue}`
        : "Status changed";
    case "severity_escalated":
      return entry.oldValue && entry.newValue
        ? `Severity: ${entry.oldValue} \u2192 ${entry.newValue}`
        : "Severity escalated";
    case "repeat_confirmed":
      return "Repeat finding confirmed";
    case "repeat_dismissed":
      return "Repeat finding dismissed";
    case "resolved_during_fieldwork":
      return "Resolved during fieldwork";
    default:
      return entry.event.replace(/_/g, " ");
  }
}

export function StatusTimeline({ entries }: StatusTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm italic">
        No timeline events recorded.
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const config = EVENT_CONFIG[entry.event] ?? DEFAULT_CONFIG;
        const Icon = config.icon;
        const description = getEventDescription(entry);

        return (
          <div key={entry.id} className="relative flex gap-4 pb-8 last:pb-0">
            {/* Vertical connecting line */}
            {!isLast && (
              <div className="bg-border absolute top-4 left-[7px] h-full w-px" />
            )}

            {/* Timeline dot */}
            <div
              className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${config.color}`}
            />

            {/* Content */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Icon className="text-muted-foreground h-3.5 w-3.5" />
                <p className="text-sm font-medium">{description}</p>
              </div>
              {entry.comment && (
                <p className="text-muted-foreground text-sm">{entry.comment}</p>
              )}
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span>{entry.createdBy.name}</span>
                <span>&middot;</span>
                <time>
                  {formatDate(
                    typeof entry.createdAt === "string"
                      ? entry.createdAt
                      : entry.createdAt.toISOString(),
                    "long",
                  )}
                </time>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
