# Ruta Nitro · Cazadores del Canon

Tragaperras de **pago por dispersion con cascadas y multiplicadores de posicion**,
ambientada en un canon desertico de carreras. Ocho o mas simbolos iguales en
cualquier parte de la rejilla forman premio; los premiados desaparecen, el resto
cae y cada casilla que gano deja una **marca de neumatico** que se duplica si
vuelve a ganar en el mismo sitio.

> Saldo de demostracion. No hay dinero real, ni depositos, ni premios.

## Ficha tecnica

| | |
| --- | --- |
| Rejilla | 6 columnas x 5 filas, sin lineas de pago |
| Premio | 8 o mas simbolos iguales en cualquier posicion |
| Marcas de posicion | x2 al ganar, se duplican hasta x8192 |
| Aplicacion | el premio se multiplica por la **suma** de las marcas que pisa |
| Vueltas gratis | 3, 4 o 5 dispersiones -> 7, 8 o 10 vueltas con 1, 2 o 3 mejoras |
| RTP medido | 96,05% |
| Premio maximo | 30 000x la apuesta |
| Volatilidad | extrema |

## Mecanicas

**Derrapes encadenados.** Mientras la rejilla siga formando premios, la jugada
continua: se retiran los simbolos ganadores, caen los de arriba y entran nuevos.

**Marcas de neumatico.** Toda casilla que participa en un premio queda marcada
con x2. Si vuelve a ganar ahi, la marca se duplica. En el juego base se limpian
en cada tirada; **durante las vueltas gratis se quedan pegadas al asfalto**, que
es de donde salen las rondas grandes.

**Cambio de marcha.** Revela un simbolo de pago, lo expande sobre su columna y
refuerza la marca de su casilla x2, x4 u x8. Si caen varios, todos revelan el
mismo simbolo.

**Rebufo** (mejora). Cada marcha contagia una duplicacion a todas las copias de
su simbolo que ya tengan marca.

**Bidon de nitro.** Cuando la rejilla se queda sin premio, los bidones detonan:
limpian un 3x3 (5x5 con la mejora) y duplican las marcas que alcanzan. Comodines
y dispersiones aguantan la explosion.

## Aleatoriedad verificable

Una tirada consume cientos de numeros aleatorios. Todos salen de un unico flujo
determinista:

```
bloque_n = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${n}`)
```

Cada bloque de 32 octetos rinde ocho flotantes de 32 bits, y el cursor `n` avanza
segun se consumen. El SHA-256 de la semilla del servidor se publica antes de
jugar; al rotar semillas se revela la original y cualquier tirada pasada se
reproduce entera, simbolo a simbolo.

SHA-256 y HMAC van implementados a mano en `src/game/hash.ts` porque
`crypto.subtle` solo existe en contextos seguros y obliga a un API asincrono,
cuando el motor necesita pedir numeros de forma sincrona a mitad de una cascada.

## Calibrado del RTP

La combinacion de pago por dispersion, cascadas y marcas acumulables **no se
resuelve a mano**: hay que medirla. `src/game/simulate.ts` juega rondas completas
sin animacion y reporta RTP, reparto entre juego base y bonus, frecuencia del
bonus, cola de premios grandes y marca mas alta alcanzada.

```bash
npm run simulate -- 8000000
```

El calibrado actual (8 millones de tiradas) deja:

```
RTP                96,05%
  juego base       ~68%
  vueltas gratis   ~28%
tiradas premiadas  ~45%
bonus              1 de cada ~180
premio maximo      30 000x
```

Cualquier retoque de `BASE_WEIGHTS`, `FREE_WEIGHTS` o `PAYTABLE` obliga a volver
a medir. Dos hallazgos del calibrado quedaron escritos en el codigo:

- **El rebufo no puede sembrar marcas.** La lectura literal del original —cada
  copia hereda la marca del origen— cubre la rejilla en dos vueltas y manda casi
  todos los bonus al tope de pago (RTP medido: 22 000%). Ahora solo duplica
  marcas que el jugador ya se habia ganado.
- **El tope de pago es por ronda, no por tirada.** Una serie de vueltas gratis
  rebasa los 30 000x sumando premios que por separado se quedan cortos.

## Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:5174
npm run build
npm run test       # motor, criptografia y reproducibilidad
npm run simulate -- 2000000
npm run lint
```

## Estructura

```
src/
  game/
    hash.ts        SHA-256 + HMAC a mano
    fair.ts        flujo determinista de aleatorios
    symbols.ts     catalogo, tabla de pagos y pesos   (datos puros, sin imagenes)
    art.ts         enlace simbolo -> imagen y color
    engine.ts      rejilla, cascadas, marcas, marchas y bidones   (con tests)
    session.ts     encadenado de la ronda y vueltas gratis
    simulate.ts    Monte Carlo de calibrado
    sequencer.ts   reproduce el guion de etapas en la interfaz
  store/           estado (zustand + persistencia)
  components/
    grid/          rejilla, casillas y marcas
    modals/        tabla de pagos, ayuda, juego justo, sesion
tools/
  prepare-assets.sh  recorte de fondo de los iconos a WebP con alfa
  simulate.ts        lanzador del calibrador
```

## Detalles de implementacion

**El resultado precede a la animacion.** El motor resuelve la ronda entera y
devuelve el guion de etapas por las que pasa la rejilla. El secuenciador solo lo
reproduce, asi que acelerar, pausar o abandonar no puede alterar el resultado.

**El motor no depende de React ni de imagenes.** `symbols.ts` son datos puros y
`art.ts` guarda las importaciones de assets, lo que permite correr el simulador
en Node sin bundler.

**Las marcas pertenecen a la posicion, no a la ficha.** Se dibujan en una capa
aparte de la rejilla para que no se muevan cuando los simbolos caen.

## Arte

Personajes y simbolos originales generados sobre fondo negro plano y recortados
con `tools/prepare-assets.sh`, que quita el fondo por difusion desde las esquinas
y despues rellena los huecos interiores que quedan en las zonas oscuras (el coche
negro y los neumaticos serian imposibles con un recorte de una sola pasada).

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Motion · Zustand · Vitest
