// カード用の「それっぽい風景」をSVGで生成（オフラインでも必ず表示）。
// 本物の写真に差し替えたくなったら、fixtures の SPOT_IMAGES を実URLに変えるだけ。

type Palette = { sky: [string, string]; sun: string; hills: [string, string, string] };
const NATURE: Palette = {
  sky: ["#cdeeff", "#eaf8ff"],
  sun: "#ffe08a",
  hills: ["#bfe0a0", "#8fc77e", "#5fa86a"],
};
const PALETTE: Record<string, Palette> = {
  nature: NATURE,
  history: {
    sky: ["#ffd9a8", "#ffeccb"],
    sun: "#ff9d5c",
    hills: ["#caa07e", "#a9785a", "#7d5440"],
  },
  gourmet: {
    sky: ["#ffe7b3", "#fff3d6"],
    sun: "#ff8a3c",
    hills: ["#e6c067", "#d39a40", "#b87a30"],
  },
};

// 決定的な擬似乱数（seedで風景の起伏を少し変える）
function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function sceneSvg(category: string, seed = 1): string {
  const p: Palette = PALETTE[category] ?? NATURE;
  const r = rng(seed * 97 + 13);
  const hill = (color: string, baseY: number, amp: number) => {
    const n = 5;
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
      const x = Math.round((640 / n) * i);
      const y = Math.round(baseY + (r() - 0.5) * 2 * amp);
      pts.push(`${x},${y}`);
    }
    return `<polygon points="0,380 ${pts.join(" ")} 640,380" fill="${color}"/>`;
  };
  const sunX = Math.round(110 + r() * 420);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/>` +
    `</linearGradient></defs>` +
    `<rect width="640" height="380" fill="url(#sky)"/>` +
    `<circle cx="${sunX}" cy="84" r="40" fill="${p.sun}" opacity="0.9"/>` +
    hill(p.hills[0], 175, 28) +
    hill(p.hills[1], 235, 36) +
    hill(p.hills[2], 300, 30) +
    `</svg>`
  );
}
