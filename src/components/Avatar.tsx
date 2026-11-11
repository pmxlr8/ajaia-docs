export function Avatar({
  name,
  color,
  size = 24,
  ring = false,
  title,
}: {
  name: string;
  color: string;
  size?: number;
  ring?: boolean;
  title?: string;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      title={title}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white ${ring ? "ring-2 ring-white" : ""}`}
      style={{ background: color, width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 24 }: { people: { name: string; color: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} color={p.color} size={size} ring title={p.name} />
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-neutral-100 font-mono text-[10px] text-neutral-600 ring-2 ring-white"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
