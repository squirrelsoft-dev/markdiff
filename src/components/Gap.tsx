export function Gap({
  count,
  onExpand,
}: {
  count: number;
  onExpand: () => void;
}) {
  return (
    <button className="gap" onClick={onExpand} type="button">
      <span className="gap-rule" aria-hidden="true" />
      <span className="gap-label">
        {count.toLocaleString()} unchanged {count === 1 ? "line" : "lines"}
      </span>
      <span className="gap-rule" aria-hidden="true" />
    </button>
  );
}
