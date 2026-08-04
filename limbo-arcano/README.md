# Limbo Arcano · Reinos del Abismo

Recreacion del juego **Limbo** (multiplicador objetivo) con estetica de nicho gotico:
eliges el multiplicador al que apuntas, el carrusel gira y aterriza sobre el resultado
de una ronda *provably fair*. Si el multiplicador revelado alcanza tu objetivo, cobras.

> Saldo de demostracion. No hay dinero real, ni depositos, ni premios.

## Como funciona el juego

| Concepto | Valor |
| --- | --- |
| Probabilidad de acierto | `99 / objetivo` por ciento |
| Pago | `apuesta × objetivo` |
| Ventaja de la casa | 1% en **todos** los objetivos (RTP 99%) |
| Objetivo minimo / maximo | `1.01x` / `1 000 000x` |

Subir el objetivo cambia la varianza, nunca el margen: `2.00x` acierta el 49.50% de las
veces, `100x` el 0.99%, y en ambos casos el retorno esperado es el mismo.

## Justicia verificable

Cada ronda sale de:

```
hmac  = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)
float = Σ hmac[i] / 256^(i+1)     para i = 0..3        -> uniforme [0, 1)
mult  = max(1, floor(0.99 / float × 100) / 100)
```

El SHA-256 de la semilla del servidor se publica **antes** de jugar, asi que no puede
cambiarse a posteriori. Al rotar semillas se revela la original y cualquier ronda pasada
puede recalcularse desde el verificador integrado (o desde cualquier implementacion de
HMAC-SHA256).

SHA-256 y HMAC van implementados a mano en `src/game/fair.ts` en lugar de usar
`crypto.subtle`, que solo existe en contextos seguros y obliga a un API asincrono: el
verificador tiene que poder ejecutarse en cualquier despliegue y de forma sincrona.

## Puesta en marcha

```bash
npm install
npm run dev      # servidor de desarrollo en http://localhost:5173
npm run build    # produccion en dist/
npm run test     # matematica y vectores criptograficos
npm run lint
```

## Estructura

```
src/
  game/          nucleo sin React: fair, escalones, relleno del carrusel, audio, formato
    fair.ts      SHA-256 + HMAC + distribucion de Limbo   (con tests)
    tiers.ts     los siete moradores y sus rangos
    reel.ts      valores decorativos de la tira
    audio.ts     sintesis WebAudio, sin ficheros de sonido
  store/         estado unico (zustand + persistencia en localStorage)
  components/
    reel/        carrusel, casillas y celebracion
    modals/      juego justo, historial, estadisticas, ayuda
    ui/          primitivas reutilizables
  i18n.ts        espanol e ingles
tools/
  prepare-assets.sh   recorte del fondo de los retratos a WebP con alfa
```

## Detalles de implementacion

**El resultado precede a la animacion.** `roll()` resuelve la ronda criptograficamente y
la deja en `pending`; el carrusel solo la revela y llama a `settle()` al aterrizar. La
animacion no puede alterar el resultado ni cuando se manipula el reloj del navegador.

**El bucle del carrusel no re-renderiza.** Posicion, desenfoque de movimiento y foco de
la casilla central se escriben directamente sobre el DOM mediante la variable CSS `--k`.
React solo interviene una vez por giro, para colocar la ventana de casillas.

**Las casillas de relleno son decorativas.** Se reparten entre escalones con pesos
propios porque la distribucion real de Limbo dejaria la mitad de la tira por debajo de
2x. Solo la casilla que queda bajo la aguja procede del sorteo verificable, y asi se
indica en la ayuda del juego.

**Truncado sin robar centesimos.** `0.99 / 0.1` da `9.899999999999999` en coma flotante;
truncar eso a dos decimales devolveria `9.89`. El calculo normaliza a doce cifras
significativas antes de truncar, que absorben el error sin llegar a confundir dos
resultados distintos.

## Arte

Los siete retratos se generaron sobre fondo negro plano y se recortaron con
`tools/prepare-assets.sh`: un relleno por difusion desde las cuatro esquinas quita el
fondo, y una segunda pasada rellena los huecos interiores que el primero deja en las
zonas oscuras del personaje (capas, escamas). Salida en WebP con alfa, unos 50 kB por
personaje.

```bash
./tools/prepare-assets.sh <dir-con-char-*.png> src/assets/characters
```

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Motion · Zustand · Vitest
