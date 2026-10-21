import { useId } from "react";

/**
 * Illustrations vectorielles ORIGINALES, une par domaine d'intervention : même grille, même lumière, même palette.
 * Elles remplacent le quadrillage générique tant qu'aucune photographie n'est choisie. Décoratives (aria-hidden) :
 * le titre de la fiche porte le sens. Aucune fausse capture d'écran d'un outil existant.
 */
const L = "#8fc0e6";   // trait clair
const Y = "#f5c400";   // accent signal
const F = "#0d2a3f";   // remplissage
const sw = { strokeWidth: 5, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

function Motif({ slug }: { slug: string }) {
  switch (slug) {
    case "sites-performance-referencement":
      return (<g>
        <rect x="70" y="42" width="260" height="164" rx="12" fill={F} stroke={L} strokeWidth="4" />
        <path d="M70 76 H330" stroke={L} strokeWidth="3" />
        {[88, 104, 120].map((x) => <circle key={x} cx={x} cy="59" r="4.5" fill={x === 88 ? Y : L} />)}
        <path d="M104 158 A48 48 0 0 1 200 158" stroke={L} strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M104 158 A48 48 0 0 1 180 119" stroke={Y} strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M152 158 L176 128" stroke={Y} strokeWidth="4" strokeLinecap="round" /><circle cx="152" cy="158" r="6" fill={Y} />
        {[[236, 102, 70], [236, 122, 48], [236, 142, 60]].map(([x, y, w]) => <rect key={y} x={x} y={y} width={w} height="9" rx="4.5" fill={L} opacity=".45" />)}
        <circle cx="286" cy="186" r="25" fill="#0a1d2c" stroke={Y} strokeWidth="6" /><path d="M305 205 L330 230" stroke={Y} strokeWidth="8" strokeLinecap="round" />
      </g>);
    case "e-commerce-paiements":
      return (<g>
        <path d="M72 70 H108 L130 160 H252 L276 96 H116" {...sw} stroke={L} />
        <circle cx="150" cy="186" r="12" fill={Y} /><circle cx="236" cy="186" r="12" fill={Y} />
        <g transform="rotate(-9 300 90)"><rect x="252" y="48" width="104" height="66" rx="9" fill={F} stroke={L} strokeWidth="4" /><rect x="252" y="64" width="104" height="14" fill={Y} /><rect x="266" y="92" width="30" height="9" rx="3" fill={L} opacity=".6" /></g>
        <circle cx="322" cy="176" r="24" fill={F} stroke={Y} strokeWidth="5" /><path d="M311 176 L319 185 L334 167" stroke={Y} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>);
    case "securite-conformite-fiabilite":
      return (<g>
        <path d="M200 40 L282 70 V122 C282 168 246 198 200 214 C154 198 118 168 118 122 V70 Z" fill={F} stroke={L} strokeWidth="5" strokeLinejoin="round" />
        <path d="M200 62 L262 84 V122 C262 154 236 178 200 192 C164 178 138 154 138 122 V84 Z" fill="none" stroke={L} strokeWidth="2" opacity=".5" />
        <path d="M166 126 L192 152 L238 100" stroke={Y} strokeWidth="11" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {[[80, 90], [320, 90], [96, 190], [306, 196]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill={L} opacity=".6" />)}
      </g>);
    case "marketing-acquisition":
      return (<g>
        <path d="M84 62 H316 L238 132 V188 L162 212 V132 Z" fill={F} stroke={L} strokeWidth="5" strokeLinejoin="round" />
        {[[110, 40], [150, 34], [200, 42], [250, 34], [292, 40]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="6" fill={L} />)}
        <path d="M120 84 H280 M156 108 H246" stroke={L} strokeWidth="3" opacity=".5" />
        <circle cx="200" cy="228" r="13" fill={Y} />
        <path d="M322 196 V150 M308 164 L322 148 L336 164" stroke={Y} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>);
    case "contenu-video-design":
      return (<g>
        <rect x="76" y="46" width="248" height="146" rx="14" fill={F} stroke={L} strokeWidth="5" />
        <path d="M184 90 V148 L236 119 Z" fill={Y} />
        <path d="M76 214 H324" stroke={L} strokeWidth="4" strokeLinecap="round" opacity=".6" /><circle cx="196" cy="214" r="9" fill={Y} />
        <path d="M96 172 C128 128 156 188 196 150" stroke={L} strokeWidth="3" fill="none" strokeDasharray="2 6" strokeLinecap="round" />
        <rect x="90" y="166" width="12" height="12" fill="none" stroke={L} strokeWidth="3" />
      </g>);
    case "automatisation-ia":
      return (<g>
        <circle cx="150" cy="116" r="34" fill="none" stroke={L} strokeWidth="14" strokeDasharray="13.4 13.4" />
        <circle cx="150" cy="116" r="30" fill={F} stroke={L} strokeWidth="4" /><circle cx="150" cy="116" r="11" fill="none" stroke={Y} strokeWidth="5" />
        <circle cx="240" cy="156" r="26" fill="none" stroke={L} strokeWidth="12" strokeDasharray="10.2 10.2" />
        <circle cx="240" cy="156" r="22" fill={F} stroke={L} strokeWidth="4" /><circle cx="240" cy="156" r="8" fill="none" stroke={Y} strokeWidth="4" />
        <path d="M84 196 L124 140 M312 82 L262 132 M300 214 L262 176" stroke={L} strokeWidth="3" strokeLinecap="round" opacity=".6" />
        {[[84, 196], [312, 82], [300, 214]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="9" fill={Y} />)}
      </g>);
    case "donnees-finance-gestion":
      return (<g>
        <path d="M86 56 V204 H328" stroke={L} strokeWidth="4" fill="none" strokeLinecap="round" />
        {[[110, 150], [150, 126], [190, 138], [230, 96]].map(([x, h]) => <rect key={x} x={x} y={204 - (204 - h)} width="26" height={204 - h} rx="3" fill={L} opacity=".4" />)}
        <rect x="270" y="62" width="26" height="142" rx="3" fill={Y} />
        <polyline points="123,128 163,108 203,118 243,80 283,52" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {[[123, 128], [163, 108], [203, 118], [243, 80], [283, 52]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5.5" fill="#0a1d2c" stroke="#fff" strokeWidth="3" />)}
      </g>);
    case "formation-produits-numeriques":
      return (<g>
        <path d="M200 84 C170 64 128 62 96 76 V190 C128 176 170 178 200 198 C230 178 272 176 304 190 V76 C272 62 230 64 200 84 Z" fill={F} stroke={L} strokeWidth="5" strokeLinejoin="round" />
        <path d="M200 84 V198" stroke={L} strokeWidth="3" />
        {[104, 124, 144, 164].map((y, i) => <path key={y} d={`M120 ${y} H${i % 2 ? 168 : 176}`} stroke={L} strokeWidth="4" strokeLinecap="round" opacity=".55" />)}
        <path d="M252 102 V148 M232 130 L252 150 L272 130" stroke={Y} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M230 168 H274" stroke={Y} strokeWidth="6" strokeLinecap="round" />
      </g>);
    case "services-rh-metiers":
      return (<g>
        <rect x="76" y="54" width="176" height="154" rx="12" fill={F} stroke={L} strokeWidth="5" />
        <rect x="76" y="54" width="176" height="32" rx="12" fill={L} opacity=".35" />
        {[0, 1, 2, 3].flatMap((c) => [0, 1, 2].map((r) => <rect key={`${c}${r}`} x={96 + c * 38} y={104 + r * 32} width="22" height="18" rx="3" fill={c === 2 && r === 1 ? Y : L} opacity={c === 2 && r === 1 ? 1 : 0.4} />))}
        <circle cx="304" cy="108" r="20" fill="none" stroke={L} strokeWidth="5" /><path d="M268 190 C268 148 340 148 340 190" fill="none" stroke={L} strokeWidth="5" strokeLinecap="round" />
        <circle cx="318" cy="64" r="9" fill={Y} />
      </g>);
    case "multilingue-accessibilite":
      return (<g>
        <circle cx="160" cy="128" r="64" fill={F} stroke={L} strokeWidth="5" />
        <ellipse cx="160" cy="128" rx="26" ry="64" fill="none" stroke={L} strokeWidth="3" /><path d="M96 128 H224 M106 96 H214 M106 160 H214" stroke={L} strokeWidth="3" opacity=".7" />
        <circle cx="300" cy="86" r="34" fill="none" stroke={Y} strokeWidth="5" /><circle cx="300" cy="70" r="6" fill={Y} />
        <path d="M280 86 H320 M300 88 V108 M300 108 L290 126 M300 108 L310 126" stroke={Y} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="296" cy="196" r="9" fill={L} opacity=".6" />
      </g>);
    default:
      return (<g><circle cx="200" cy="125" r="52" fill={F} stroke={L} strokeWidth="5" /><circle cx="200" cy="125" r="16" fill={Y} /></g>);
  }
}

export function DomainArt({ slug, className }: { slug?: string | null; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0e4f7a" /><stop offset="1" stopColor="#0a1d2c" /></linearGradient>
        <pattern id={`gr${id}`} width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0 H0 V25" fill="none" stroke="#fff" strokeOpacity=".06" /></pattern>
      </defs>
      <rect width="400" height="250" fill={`url(#bg${id})`} /><rect width="400" height="250" fill={`url(#gr${id})`} />
      <Motif slug={slug ?? ""} />
    </svg>
  );
}
