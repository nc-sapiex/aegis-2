export function WeightInput({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={1}
      max={100}
      step={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Weight"
      className="w-16 rounded-[2px] border border-[color:hsl(var(--border-strong))] px-1.5 py-1 text-[13px] tabular-nums disabled:opacity-50"
    />
  );
}
