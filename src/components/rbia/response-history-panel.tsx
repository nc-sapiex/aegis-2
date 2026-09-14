export type RevisionEntry = {
  scoreLabel: string;
  reason: string;
  revisedByName: string;
  revisedAt: string;
};

export function ResponseHistoryPanel({
  original,
  revisions,
}: {
  original: RevisionEntry;
  revisions: RevisionEntry[];
}) {
  return (
    <div className="fixed top-0 right-0 h-full w-[440px] border-l border-[color:var(--border)] bg-[color:var(--background)] p-4">
      <h2 className="text-[16px] font-medium">Score history</h2>
      <div className="mt-4 border-b border-[color:var(--border)] py-2 text-sm">
        <div>
          {original.scoreLabel} — original, {original.revisedByName},{" "}
          {original.revisedAt}
        </div>
      </div>
      {revisions.map((revision, index) => (
        <div
          key={`${revision.revisedAt}-${index}`}
          className="border-b border-[color:var(--border)] py-2 text-sm"
        >
          <div>
            {revision.scoreLabel} — {revision.reason}, {revision.revisedByName},{" "}
            {revision.revisedAt}
          </div>
        </div>
      ))}
    </div>
  );
}
