const PALETTES = [
  ["#ff7a59", "#ffb36b"],
  ["#8b7cff", "#c3a6ff"],
  ["#4cb8f5", "#7ee0e6"],
  ["#ff8ad8", "#ffb0a0"],
  ["#2fd09a", "#a8e05f"],
  ["#ffc24b", "#ff8a5c"],
  ["#5b6cff", "#4cb8f5"],
  ["#e36bff", "#8b7cff"],
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

export function palette(id: string): [string, string] {
  return PALETTES[hash(id) % PALETTES.length] as [string, string];
}

export function gradient(id: string) {
  const [a, b] = palette(id);
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
