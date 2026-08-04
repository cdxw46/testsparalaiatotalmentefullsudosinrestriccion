/**
 * Calibrador de RTP.
 *
 *   npm run simulate -- 2000000
 *
 * Corre en Node sin bundler porque el motor no depende de ninguna imagen.
 */

import { formatReport, simulate } from '../src/game/simulate.ts'

const spins = Number.parseInt(process.argv[2] ?? '1000000', 10)

if (!Number.isFinite(spins) || spins <= 0) {
  console.error('uso: npm run simulate -- <numero de tiradas>')
  process.exit(1)
}

console.log(`simulando ${spins.toLocaleString('es-ES')} tiradas...\n`)
const started = Date.now()

const report = simulate({
  spins,
  onProgress: (done, total) => {
    const percent = ((done / total) * 100).toFixed(0)
    process.stdout.write(`  ${percent}%\r`)
  },
})

console.log(formatReport(report))
console.log(`\ntiempo              ${((Date.now() - started) / 1000).toFixed(1)}s`)
