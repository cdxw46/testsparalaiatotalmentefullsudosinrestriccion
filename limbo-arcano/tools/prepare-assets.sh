#!/usr/bin/env bash
# Recorta el fondo negro de los retratos de personaje y los exporta a WebP con alfa.
#
# El generador de arte entrega PNG cuadrados con fondo negro puro. Un simple
# flood-fill deja agujeros en las zonas oscuras del propio personaje (capas,
# escamas), asi que la mascara se reconstruye en dos pasos: se recorta el fondo
# conectado al borde y despues se rellenan los huecos interiores que quedaron.
#
#   uso: ./tools/prepare-assets.sh <dir-origen> <dir-destino>

set -euo pipefail

SRC_DIR="${1:-}"
OUT_DIR="${2:-}"
FUZZ="${FUZZ:-1%}"
SIZE="${SIZE:-560x560}"
QUALITY="${QUALITY:-86}"

if [[ -z "$SRC_DIR" || -z "$OUT_DIR" ]]; then
  echo "uso: $0 <dir-origen> <dir-destino>" >&2
  exit 1
fi

command -v convert >/dev/null || { echo "falta ImageMagick (apt install imagemagick)" >&2; exit 1; }

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for src in "$SRC_DIR"/char-*.png; do
  [[ -e "$src" ]] || { echo "sin imagenes char-*.png en $SRC_DIR" >&2; exit 1; }
  name="$(basename "$src" .png)"
  name="${name#char-}"

  dims="$(identify -format '%w %h' "$src")"
  x1=$(( ${dims% *} - 1 ))
  y1=$(( ${dims#* } - 1 ))

  # 1. Fondo conectado a las cuatro esquinas -> transparente.
  convert "$src" -alpha set -channel RGBA -fuzz "$FUZZ" -fill none \
    -floodfill "+0+0" black \
    -floodfill "+${x1}+0" black \
    -floodfill "+0+${y1}" black \
    -floodfill "+${x1}+${y1}" black \
    +channel "$TMP/cut.png"

  convert "$TMP/cut.png" -alpha extract "$TMP/alpha.png"

  # 2. Los huecos interiores no tocan el borde: invertir, vaciar la region
  #    exterior y volver a unir deja la silueta rellena.
  convert "$TMP/alpha.png" -negate -fuzz 20% -fill black \
    -floodfill "+0+0" white \
    -floodfill "+${x1}+0" white \
    -floodfill "+0+${y1}" white \
    -floodfill "+${x1}+${y1}" white \
    "$TMP/holes.png"

  convert "$TMP/alpha.png" "$TMP/holes.png" -compose Lighten -composite \
    -blur 0x0.8 -level 40%,100% "$TMP/mask.png"

  convert "$src" "$TMP/mask.png" -alpha off -compose CopyOpacity -composite \
    -trim +repage -resize "$SIZE" \
    -quality "$QUALITY" -define webp:method=6 "$OUT_DIR/${name}.webp"

  echo "  ok  ${name}.webp  $(identify -format '%wx%h  %b' "$OUT_DIR/${name}.webp")"
done

echo "listo -> $OUT_DIR"
