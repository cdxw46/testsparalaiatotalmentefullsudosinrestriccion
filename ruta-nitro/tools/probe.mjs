/**
 * Sonda de extremo a extremo.
 *
 * Abre el juego en un Chrome real, compra la funcion y sigue la ronda entera
 * anotando lo que aparece en pantalla y cualquier error de consola. Sirve para
 * comprobar cosas que una captura suelta no puede: si un cartel llega a salir,
 * cuanto dura y en que orden.
 *
 *   node tools/probe.mjs [url]
 */

import puppeteer from 'puppeteer-core'

const URL = process.argv[2] ?? 'http://localhost:5174/'
const CHROME = '/usr/local/bin/google-chrome'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
})

const page = await browser.newPage()
const problems = []

page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    problems.push(`[consola ${message.type()}] ${message.text()}`)
  }
})
page.on('pageerror', (error) => problems.push(`[excepcion] ${error.message}`))

await page.goto(URL, { waitUntil: 'networkidle2' })
await sleep(800)

const cells = await page.$$eval('.nitro-cell', (nodes) => nodes.length)
console.log(`casillas renderizadas: ${cells}`)

// El turbo acorta las esperas y haria imposible cronometrar los carteles.
const turboOn = await page.$$eval('header button[aria-pressed="true"]', (nodes) => nodes.length)
console.log(`botones activos en la barra: ${turboOn}`)

const buy = await page.evaluateHandle(() =>
  [...document.querySelectorAll('button')].find((node) => /comprar|buy/i.test(node.textContent ?? '')),
)
if (!(await buy.evaluate((node) => Boolean(node)))) {
  console.error('no se encontro el boton de compra')
  await browser.close()
  process.exit(1)
}

await buy.asElement().click()
console.log('compra pulsada; siguiendo la ronda...\n')

/** Instantanea de lo que hay en pantalla ahora mismo. */
const snapshot = () =>
  page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null
    const body = document.body.innerText
    return {
      intro: /HAS ABIERTO LA PARRILLA|YOU MADE THE GRID/i.test(body),
      outro: /SERIE TERMINADA|RUN FINISHED/i.test(body),
      counter: (body.match(/Vuelta \d+ de \d+|Spin \d+ of \d+/) ?? [null])[0],
      marks: document.querySelectorAll('.nitro-mark').length,
      cells: document.querySelectorAll('.nitro-cell').length,
      win: text('main + section .tabular') ?? null,
    }
  })

const seen = { intro: 0, outro: 0, counters: new Set(), maxMarks: 0, minCells: 99 }

for (let tick = 0; tick < 240; tick++) {
  const state = await snapshot()
  if (state.intro) seen.intro += 1
  if (state.outro) seen.outro += 1
  if (state.counter) seen.counters.add(state.counter)
  seen.maxMarks = Math.max(seen.maxMarks, state.marks)
  seen.minCells = Math.min(seen.minCells, state.cells)
  await sleep(250)
}

console.log(`cartel de entrada visto en ${seen.intro} muestras (${seen.intro * 250} ms aprox)`)
console.log(`cartel final visto en   ${seen.outro} muestras (${seen.outro * 250} ms aprox)`)
console.log(`contadores distintos:   ${[...seen.counters].join(' · ') || 'ninguno'}`)
console.log(`marcas simultaneas max: ${seen.maxMarks}`)
console.log(`casillas minimas:       ${seen.minCells}`)

console.log(`\nproblemas de consola: ${problems.length}`)
for (const problem of problems) console.log(`  ${problem}`)

await browser.close()
