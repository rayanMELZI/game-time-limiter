import { hueFor } from "../format";

export default function AppAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = hueFor(name);
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 65% 42%))`,
      }}
    >
      {letters || "?"}
    </div>
  );
}
