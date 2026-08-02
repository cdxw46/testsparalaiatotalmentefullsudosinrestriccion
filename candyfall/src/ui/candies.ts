import type { SymbolId } from '../game/types';

/** Pure SVG candy art — glossy, readable at small sizes */
export function candySvg(id: SymbolId): string {
  switch (id) {
    case 'bear-red':
      return bear('#ff4d6d', '#ff8fa3', '#b01030');
    case 'bear-purple':
      return bear('#a855f7', '#d8b4fe', '#6b21a8');
    case 'bear-orange':
      return bear('#fb923c', '#fdba74', '#c2410c');
    case 'heart':
      return heart();
    case 'star':
      return star();
    case 'round':
      return roundCandy();
    case 'bean':
      return bean();
    case 'lime':
      return lime();
    case 'scatter':
      return scatter();
  }
}

function shine() {
  return `<ellipse cx="34" cy="28" rx="14" ry="8" fill="white" opacity="0.35" transform="rotate(-28 34 28)"/>
    <ellipse cx="30" cy="24" rx="5" ry="2.5" fill="white" opacity="0.55" transform="rotate(-28 30 24)"/>`;
}

function bear(main: string, light: string, dark: string): string {
  return `<svg viewBox="0 0 80 80" class="candy-svg" aria-hidden="true">
    <defs>
      <radialGradient id="bg-${main}" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="${light}"/>
        <stop offset="70%" stop-color="${main}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </radialGradient>
    </defs>
    <circle cx="26" cy="24" r="11" fill="url(#bg-${main})"/>
    <circle cx="54" cy="24" r="11" fill="url(#bg-${main})"/>
    <ellipse cx="40" cy="46" rx="24" ry="22" fill="url(#bg-${main})"/>
    <ellipse cx="40" cy="50" rx="12" ry="9" fill="${light}" opacity="0.55"/>
    <circle cx="32" cy="42" r="3.2" fill="#2a1520"/>
    <circle cx="48" cy="42" r="3.2" fill="#2a1520"/>
    <circle cx="33.2" cy="40.8" r="1" fill="white"/>
    <circle cx="49.2" cy="40.8" r="1" fill="white"/>
    <ellipse cx="40" cy="50" rx="4" ry="3" fill="${dark}"/>
    ${shine()}
  </svg>`;
}

function heart(): string {
  return `<svg viewBox="0 0 80 80" class="candy-svg" aria-hidden="true">
    <defs>
      <radialGradient id="heartg" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffb3c6"/>
        <stop offset="55%" stop-color="#ff4d6d"/>
        <stop offset="100%" stop-color="#c9184a"/>
      </radialGradient>
    </defs>
    <path d="M40 66C20 50 12 40 12 28c0-9 7-16 16-16 6 0 10 3 12 7 2-4 6-7 12-7 9 0 16 7 16 16 0 12-8 22-28 38z" fill="url(#heartg)"/>
    ${shine()}
  </svg>`;
}

function star(): string {
  return `<svg viewBox="0 0 80 80" class="candy-svg" aria-hidden="true">
    <defs>
      <radialGradient id="starg" cx="40%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#fff3a0"/>
        <stop offset="50%" stop-color="#7dff9a"/>
        <stop offset="100%" stop-color="#16a34a"/>
      </radialGradient>
    </defs>
    <path d="M40 10l7.4 16.8 18.6 2.2-13.8 12.4 4 18.2L40 50.6 23.8 59.6l4-18.2L14 29l18.6-2.2z" fill="url(#starg)" stroke="#15803d" stroke-width="1.5"/>
    ${shine()}
  </svg>`;
}

function roundCandy(): string {
  return `<svg viewBox="0 0 80 80" class="candy-svg" aria-hidden="true">
    <defs>
      <radialGradient id="roundg" cx="32%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#ffe4f0"/>
        <stop offset="45%" stop-color="#ff7eb6"/>
        <stop offset="100%" stop-color="#db2777"/>
      </radialGradient>
    </defs>
    <circle cx="40" cy="40" r="26" fill="url(#roundg)"/>
    <path d="M18 36c10-8 34-8 44 0" stroke="white" stroke-width="3" opacity="0.35" fill="none"/>
    <circle cx="30" cy="30" r="5" fill="white" opacity="0.45"/>
  </svg>`;
}

function bean(): string {
  return `<svg viewBox="0 0 80 80" class="candy-svg" aria-hidden="true">
    <defs>
      <linearGradient id="beang" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fbcfe8"/>
        <stop offset="45%" stop-color="#f472b6"/>
        <stop offset="100%" stop-color="#9d174d"/>
      </linearGradient>
    </defs>
    <ellipse cx="40" cy="40" rx="18" ry="28" fill="url(#beang)" transform="rotate(-18 40 40)"/>
    <ellipse cx="34" cy="30" rx="5" ry="9" fill="white" opacity="0.4" transform="rotate(-18 34 30)"/>
  </svg>`;
}

function lime(): string {
  return `<svg viewBox="0 0 80 80" class="candy-svg" aria-hidden="true">
    <defs>
      <radialGradient id="limeg" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ecfccb"/>
        <stop offset="50%" stop-color="#a3e635"/>
        <stop offset="100%" stop-color="#4d7c0f"/>
      </radialGradient>
    </defs>
    <path d="M18 42c0-16 10-28 22-28s22 12 22 28-10 28-22 28S18 58 18 42z" fill="url(#limeg)"/>
    <path d="M40 18c-4 6-6 14-6 24s2 18 6 24" stroke="#65a30d" stroke-width="2" fill="none" opacity="0.5"/>
    ${shine()}
  </svg>`;
}

function scatter(): string {
  return `<svg viewBox="0 0 80 80" class="candy-svg candy-scatter" aria-hidden="true">
    <defs>
      <linearGradient id="mach" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#67e8f9"/>
        <stop offset="100%" stop-color="#0284c7"/>
      </linearGradient>
      <radialGradient id="dome" cx="40%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#fff"/>
        <stop offset="100%" stop-color="#e0f2fe"/>
      </radialGradient>
    </defs>
    <ellipse cx="40" cy="62" rx="22" ry="6" fill="#0369a1"/>
    <rect x="22" y="48" width="36" height="14" rx="3" fill="url(#mach)"/>
    <path d="M20 48c0-18 8-30 20-30s20 12 20 30" fill="url(#dome)" stroke="#7dd3fc" stroke-width="2"/>
    <circle cx="30" cy="34" r="4" fill="#ff4d6d"/>
    <circle cx="42" cy="28" r="3.5" fill="#ffe566"/>
    <circle cx="50" cy="38" r="4" fill="#a855f7"/>
    <circle cx="36" cy="42" r="3" fill="#7dff9a"/>
    <text x="40" y="58" text-anchor="middle" font-size="7" font-family="Fredoka,sans-serif" font-weight="700" fill="white">SCATTER</text>
  </svg>`;
}
