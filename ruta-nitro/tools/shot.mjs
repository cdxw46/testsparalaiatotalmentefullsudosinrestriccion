/**
 * Capturas guiadas.
 *
 * Juega una ronda con la funcion comprada y va guardando fotogramas, que es la
 * unica forma de ver como quedan las marcas acumuladas, el adelantamiento y los
 * carteles: una captura suelta de la pantalla inicial no ensena ninguno.
 *
 *   node tools/shot.mjs [url] [prefijo]
 */

import puppeteer from 'puppeteer-core'

const URL = process.argv[2] ?? 'http://localhost:5174/'
const PREFIX = process.argv[3] ?? '/tmp/nitro-shot'
const CHROME = '/usr/local/bin/google-chrome'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1440, height: 900 },
})

const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto(URL, { waitUntil: 'networkidle2' })
await sleep(900)
await page.screenshot({ path: `${PREFIX}-00-inicio.png` })

const click = async (pattern) => {
  const handle = await page.evaluateHandle(
    (source) =>
      [...document.querySelectorAll('button')].find((node) => new RegExp(source, 'i').test(node.textContent ?? '')),
    pattern,
  )
  const element = handle.asElement()
  if (!element) throw new Error(`boton no encontrado: ${pattern}`)
  await element.click()
}

await click('comprar|buy')

let best = { marks: 0, index: 0 }
for (let frame = 1; frame <= 60; frame++) {
  await sleep(700)
  const state = await page.evaluate(() => ({
    marks: document.querySelectorAll('.nitro-mark').length,
    overtake: document.querySelectorAll('.nitro-overtake').length > 0,
    banner: /HAS ABIERTO|SERIE TERMINADA/i.test(document.body.innerText),
  }))

  // Se guarda el fotograma con mas marcas a la vista, que es el caso dificil.
  if (state.marks > best.marks) {
    best = { marks: state.marks, index: frame }
    await page.screenshot({ path: `${PREFIX}-marcas.png` })
  }
  if (state.overtake) await page.screenshot({ path: `${PREFIX}-adelantamiento.png` })
  if (state.banner) await page.screenshot({ path: `${PREFIX}-cartel.png` })
}

console.log(`mejor fotograma de marcas: ${best.marks} marcas (frame ${best.index})`)
console.log(`errores de consola: ${errors.length}`)
for (const error of errors) console.log(`  ${error}`)

await browser.close()
