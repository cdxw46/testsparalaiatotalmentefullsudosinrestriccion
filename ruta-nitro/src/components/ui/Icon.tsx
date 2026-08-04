/** Iconos en linea: no merece la pena una fuente entera para quince glifos. */

export type IconName =
  | 'volume'
  | 'mute'
  | 'bolt'
  | 'globe'
  | 'table'
  | 'clock'
  | 'shield'
  | 'help'
  | 'expand'
  | 'close'
  | 'copy'
  | 'refresh'
  | 'plus'
  | 'minus'
  | 'play'
  | 'stop'
  | 'chart'
  | 'warning'
  | 'check'
  | 'cart'

const PATHS: Record<IconName, string[]> = {
  volume: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
  mute: ['M11 5 6 9H2v6h4l5 4z', 'm22 9-6 6', 'm16 9 6 6'],
  bolt: ['M13 2 3 14h8l-1 8 10-12h-8z'],
  globe: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M3.5 12h17',
    'M12 3a14 14 0 0 1 3.5 9 14 14 0 0 1-3.5 9 14 14 0 0 1-3.5-9A14 14 0 0 1 12 3z',
  ],
  table: ['M4 5.5h16v13H4z', 'M4 10h16', 'M4 14.5h16', 'M10 5.5v13'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3.5 2'],
  shield: [
    'M20 12.5c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20 4 17.5 4 12.5V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.1 9.5a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4', 'M12 17.5h.01'],
  expand: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  copy: [
    'M9 9.5A1.5 1.5 0 0 1 10.5 8h9A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 9 18.5z',
    'M5.5 15.5A1.5 1.5 0 0 1 4 14V5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 16 5v.5',
  ],
  refresh: ['M3 12a9 9 0 0 1 15.3-6.4L21 8', 'M21 3.5V8h-4.5', 'M21 12a9 9 0 0 1-15.3 6.4L3 16', 'M3 20.5V16h4.5'],
  plus: ['M5 12h14', 'M12 5v14'],
  minus: ['M5 12h14'],
  play: ['M8 5.5 18.5 12 8 18.5z'],
  stop: ['M6.5 5.5h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z'],
  chart: ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
  warning: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8v5', 'M12 16.5h.01'],
  check: ['M20 6.5 9.5 17 4 11.5'],
  cart: ['M3 4h2l2.4 10.4A2 2 0 0 0 9.35 16h7.5a2 2 0 0 0 1.95-1.55L20.5 7H6', 'M10 20h.01', 'M17 20h.01'],
}

interface IconProps {
  name: IconName
  className?: string
  strokeWidth?: number
}

export function Icon({ name, className = 'size-5', strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
