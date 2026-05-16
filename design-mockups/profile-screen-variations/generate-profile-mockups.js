const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const outDir = __dirname;
const W = 1080;
const H = 1920;

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function text(x, y, value, size, fill = "#ffffff", weight = 700, extra = "") {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="Inter, SF Pro Display, Arial, sans-serif" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
}

function pill(x, y, w, h, label, fill, stroke, color = "#eafff1") {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    ${text(x + w / 2, y + h / 2 + 8, label, 25, color, 850, 'text-anchor="middle"')}
  `;
}

function avatar(cx, cy, r, ringA = "#79d99a", ringB = "#facc15") {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r + 9}" fill="url(#avatarRing)" opacity="0.95"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="#071009"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#avatarFace)"/>
    <circle cx="${cx - r * 0.28}" cy="${cy - r * 0.12}" r="${r * 0.08}" fill="#061006" opacity="0.8"/>
    <circle cx="${cx + r * 0.28}" cy="${cy - r * 0.12}" r="${r * 0.08}" fill="#061006" opacity="0.8"/>
    <path d="M ${cx - r * 0.28} ${cy + r * 0.22} Q ${cx} ${cy + r * 0.38} ${cx + r * 0.28} ${cy + r * 0.22}" fill="none" stroke="#061006" stroke-width="8" stroke-linecap="round" opacity="0.65"/>
  `;
}

function baseDefs() {
  return `
    <defs>
      <radialGradient id="bg" cx="50%" cy="-8%" r="82%">
        <stop offset="0%" stop-color="#16351f"/>
        <stop offset="36%" stop-color="#0a0f0a"/>
        <stop offset="100%" stop-color="#030403"/>
      </radialGradient>
      <linearGradient id="glass" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#20291f" stop-opacity="0.98"/>
        <stop offset="55%" stop-color="#101610" stop-opacity="0.96"/>
        <stop offset="100%" stop-color="#070907" stop-opacity="0.99"/>
      </linearGradient>
      <linearGradient id="softGreen" x1="0" x2="1">
        <stop offset="0%" stop-color="#79d99a"/>
        <stop offset="100%" stop-color="#35b96f"/>
      </linearGradient>
      <linearGradient id="amber" x1="0" x2="1">
        <stop offset="0%" stop-color="#facc15"/>
        <stop offset="100%" stop-color="#f59e0b"/>
      </linearGradient>
      <linearGradient id="blue" x1="0" x2="1">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#2563eb"/>
      </linearGradient>
      <linearGradient id="avatarRing" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#79d99a"/>
        <stop offset="58%" stop-color="#facc15"/>
        <stop offset="100%" stop-color="#38bdf8"/>
      </linearGradient>
      <radialGradient id="avatarFace" cx="46%" cy="30%" r="75%">
        <stop offset="0%" stop-color="#d7ffe6"/>
        <stop offset="45%" stop-color="#8bdba7"/>
        <stop offset="100%" stop-color="#214f31"/>
      </radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="22" stdDeviation="22" flood-color="#000000" flood-opacity="0.38"/>
      </filter>
      <filter id="glow">
        <feGaussianBlur stdDeviation="22" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
  `;
}

function frame(title, subtitle) {
  return `
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="540" cy="-45" r="410" fill="#4ade80" opacity="0.12" filter="url(#glow)"/>
    <circle cx="120" cy="310" r="230" fill="#38bdf8" opacity="0.08" filter="url(#glow)"/>
    <circle cx="970" cy="900" r="260" fill="#facc15" opacity="0.06" filter="url(#glow)"/>
    <rect x="42" y="58" width="996" height="1780" rx="54" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
    ${text(74, 122, title, 30, "#9ae6b4", 900)}
    ${text(74, 164, subtitle, 22, "#7f8b7f", 700)}
  `;
}

function statCard(x, y, w, label, value, accent = "#79d99a") {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="126" rx="30" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.09" stroke-width="2"/>
    ${text(x + w / 2, y + 50, value, 42, "#ffffff", 950, 'text-anchor="middle"')}
    ${text(x + w / 2, y + 88, label, 21, accent, 850, 'text-anchor="middle" letter-spacing="2"')}
  `;
}

function mediaTile(x, y, w, h, label, color, tall = false) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="32" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2" filter="url(#shadow)"/>
    <rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 72}" rx="24" fill="${color}" opacity="0.25"/>
    <circle cx="${x + w - 56}" cy="${y + 54}" r="22" fill="${color}" opacity="0.85"/>
    ${text(x + 28, y + h - 28, label, tall ? 26 : 24, "#f8fafc", 850)}
  `;
}

function variationOne() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${baseDefs()}
    ${frame("Variation 1", "Premium Social Vault")}
    <rect x="74" y="218" width="932" height="560" rx="48" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2" filter="url(#shadow)"/>
    <line x1="150" y1="218" x2="930" y2="218" stroke="#79d99a" stroke-opacity="0.42" stroke-width="2"/>
    ${avatar(540, 372, 118)}
    ${text(540, 548, "Aarav Sharma", 48, "#ffffff", 950, 'text-anchor="middle"')}
    ${text(540, 590, "@aarav.dares", 25, "#9fb5a5", 800, 'text-anchor="middle"')}
    ${text(540, 642, "Dare streaks, proof wins, close-friend stories.", 25, "#d3ded5", 650, 'text-anchor="middle"')}
    ${pill(304, 682, 210, 62, "Edit profile", "url(#softGreen)", "rgba(255,255,255,0.12)", "#041006")}
    ${pill(532, 682, 244, 62, "Ghost ready", "rgba(121,217,154,0.10)", "rgba(121,217,154,0.28)", "#bff7cf")}
    ${statCard(92, 820, 210, "POSTS", "48")}
    ${statCard(324, 820, 210, "DARES", "31", "#fbbf24")}
    ${statCard(556, 820, 210, "TRUTHS", "19", "#93c5fd")}
    ${statCard(788, 820, 210, "FRIENDS", "126")}
    <rect x="82" y="1000" width="916" height="78" rx="39" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.09"/>
    ${pill(104, 1012, 220, 54, "Posts", "url(#softGreen)", "rgba(121,217,154,0.4)", "#041006")}
    ${text(420, 1047, "Dares", 25, "#8ea18e", 850, 'text-anchor="middle"')}
    ${text(610, 1047, "Truths", 25, "#8ea18e", 850, 'text-anchor="middle"')}
    ${text(820, 1047, "Activity", 25, "#8ea18e", 850, 'text-anchor="middle"')}
    ${mediaTile(82, 1128, 430, 336, "Recent post", "#79d99a")}
    ${mediaTile(568, 1128, 430, 336, "Dare proof", "#f59e0b")}
    ${mediaTile(82, 1510, 430, 250, "Truth answer", "#38bdf8")}
    ${mediaTile(568, 1510, 430, 250, "Story moment", "#fb7185")}
  </svg>`;
  return svg;
}

function variationTwo() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${baseDefs()}
    ${frame("Variation 2", "Creator Grid Profile")}
    <rect x="74" y="218" width="932" height="300" rx="42" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.1" filter="url(#shadow)"/>
    ${avatar(190, 368, 86)}
    ${text(318, 320, "Aarav Sharma", 44, "#ffffff", 950)}
    ${text(318, 362, "@aarav.dares", 24, "#9fb5a5", 850)}
    ${text(318, 414, "Proof-first posts. Real or fake?", 24, "#d3ded5", 650)}
    ${pill(318, 446, 186, 54, "Edit", "url(#softGreen)", "rgba(255,255,255,0.12)", "#041006")}
    ${pill(520, 446, 188, 54, "Share", "rgba(56,189,248,0.10)", "rgba(56,189,248,0.28)", "#bae6fd")}
    <rect x="74" y="558" width="932" height="164" rx="36" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.08"/>
    ${statCard(94, 578, 210, "POSTS", "48")}
    ${statCard(322, 578, 210, "REAL", "82%", "#79d99a")}
    ${statCard(550, 578, 210, "STREAK", "12", "#fbbf24")}
    ${statCard(778, 578, 210, "VIEWS", "8.7k", "#93c5fd")}
    <rect x="74" y="766" width="932" height="74" rx="37" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.09"/>
    ${pill(92, 776, 210, 54, "Grid", "url(#softGreen)", "rgba(121,217,154,0.4)", "#041006")}
    ${text(430, 811, "Dares", 25, "#8ea18e", 850, 'text-anchor="middle"')}
    ${text(640, 811, "Truths", 25, "#8ea18e", 850, 'text-anchor="middle"')}
    ${text(850, 811, "Tagged", 25, "#8ea18e", 850, 'text-anchor="middle"')}
    ${mediaTile(74, 900, 286, 286, "Post", "#79d99a")}
    ${mediaTile(397, 900, 286, 286, "Dare", "#f59e0b")}
    ${mediaTile(720, 900, 286, 286, "Truth", "#38bdf8")}
    ${mediaTile(74, 1226, 286, 286, "Story", "#fb7185")}
    ${mediaTile(397, 1226, 286, 286, "Proof", "#facc15")}
    ${mediaTile(720, 1226, 286, 286, "Post", "#79d99a")}
    ${mediaTile(74, 1552, 286, 286, "Truth", "#38bdf8")}
    ${mediaTile(397, 1552, 286, 286, "Dare", "#f59e0b")}
    ${mediaTile(720, 1552, 286, 286, "Post", "#79d99a")}
  </svg>`;
  return svg;
}

function variationThree() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${baseDefs()}
    ${frame("Variation 3", "Dare Identity Card")}
    <rect x="74" y="218" width="932" height="418" rx="52" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.1" filter="url(#shadow)"/>
    <line x1="144" y1="218" x2="934" y2="218" stroke="#facc15" stroke-opacity="0.38" stroke-width="2"/>
    ${avatar(232, 392, 104)}
    ${text(386, 330, "Aarav Sharma", 46, "#ffffff", 950)}
    ${text(386, 372, "@aarav.dares", 24, "#9fb5a5", 850)}
    ${text(386, 426, "Level 12 challenger", 28, "#fbbf24", 900)}
    ${pill(386, 474, 210, 58, "Edit card", "url(#softGreen)", "rgba(255,255,255,0.12)", "#041006")}
    ${pill(612, 474, 238, 58, "Ghost Mode", "rgba(121,217,154,0.10)", "rgba(121,217,154,0.28)", "#bff7cf")}
    ${statCard(92, 686, 288, "COMPLETED DARES", "31", "#fbbf24")}
    ${statCard(396, 686, 288, "TRUTH SCORE", "82%", "#93c5fd")}
    ${statCard(700, 686, 288, "STREAK", "12", "#79d99a")}
    ${text(82, 914, "Timeline", 42, "#ffffff", 950)}
    ${text(82, 952, "Recent identity signals and public moments", 23, "#8ea18e", 700)}
    <rect x="82" y="1002" width="916" height="220" rx="36" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.08" filter="url(#shadow)"/>
    <circle cx="142" cy="1072" r="24" fill="url(#amber)"/>
    ${text(188, 1066, "Dare proof approved", 31, "#ffffff", 900)}
    ${text(188, 1104, "Friends voted real. Ghost Mode unlocked.", 23, "#b8c4b8", 650)}
    ${pill(188, 1138, 190, 50, "Real", "rgba(250,204,21,0.14)", "rgba(250,204,21,0.34)", "#fde68a")}
    <rect x="82" y="1264" width="916" height="220" rx="36" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.08" filter="url(#shadow)"/>
    <circle cx="142" cy="1334" r="24" fill="url(#blue)"/>
    ${text(188, 1328, "Answered a truth", 31, "#ffffff", 900)}
    ${text(188, 1366, "Now live in the Truth or Lie feed.", 23, "#b8c4b8", 650)}
    ${pill(188, 1400, 210, 50, "Truth", "rgba(56,189,248,0.13)", "rgba(56,189,248,0.32)", "#bae6fd")}
    <rect x="82" y="1526" width="916" height="220" rx="36" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.08" filter="url(#shadow)"/>
    <circle cx="142" cy="1596" r="24" fill="url(#softGreen)"/>
    ${text(188, 1590, "Posted to feed", 31, "#ffffff", 900)}
    ${text(188, 1628, "8.7k views, 432 likes, 64 comments.", 23, "#b8c4b8", 650)}
    ${pill(188, 1662, 210, 50, "Social", "rgba(121,217,154,0.13)", "rgba(121,217,154,0.32)", "#bff7cf")}
  </svg>`;
  return svg;
}

async function writePng(name, svg) {
  const out = path.join(outDir, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(out);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  await writePng("profile-variation-1-premium-social-vault.png", variationOne());
  await writePng("profile-variation-2-creator-grid.png", variationTwo());
  await writePng("profile-variation-3-dare-identity-card.png", variationThree());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
