import clsx from "clsx";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-paper text-ink-mute border-line",
  EXTRACTED: "bg-paper text-ink-soft border-line",
  ASSESSED: "bg-review-tint text-review border-review/30",
  APPROVED: "bg-go-tint text-go border-go/30",
  DECLINED: "bg-decline-tint text-decline border-decline/30",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  EXTRACTED: "Extracted",
  ASSESSED: "Awaiting decision",
  APPROVED: "Approved",
  DECLINED: "Declined",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const REC_STYLES: Record<string, string> = {
  APPROVE: "bg-go-tint text-go border-go/30",
  REVIEW: "bg-review-tint text-review border-review/30",
  DECLINE: "bg-decline-tint text-decline border-decline/30",
};

export function RecommendationBadge({ rec }: { rec: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        REC_STYLES[rec] ?? REC_STYLES.REVIEW
      )}
    >
      {rec}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const tone =
    value >= 75 ? "bg-go" : value >= 50 ? "bg-review" : "bg-decline";
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-line">
        <div className={clsx("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
      <span className="tnum text-sm text-ink-soft">{value}%</span>
    </div>
  );
}

const SEVERITY: Record<string, string> = {
  low: "text-ink-mute",
  medium: "text-review",
  high: "text-decline",
};

export function SeverityDot({ severity }: { severity: string }) {
  return (
    <span className={clsx("text-lg leading-none", SEVERITY[severity] ?? SEVERITY.low)}>
      ●
    </span>
  );
}
