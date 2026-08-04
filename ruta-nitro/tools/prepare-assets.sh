#!/usr/bin/env bash
# Recorta el fondo negro de los iconos generados y los exporta a WebP con alfa.
#
# El generador entrega PNG cuadrados sobre negro puro. Un flood-fill simple deja
# agujeros en las zonas oscuras del propio objeto (neumaticos, capo negro), asi
# que la mascara se reconstruye en dos pasos: se quita el fondo conectado a las
# esquinas y despues se rellenan los huecos interiores que quedaron sueltos.
#
#   uso: ./tools/prepare-assets.sh <dir-origen> <dir-destino> <patron>
#   ej.: ./tools/prepare-assets.sh /tmp/art src/assets/cars 'car-*.png'

set -euo pipefail

SRC_DIR="${1:-}"
OUT_DIR="${2:-}"
PATTERN="${3:-*.png}"
FUZZ="${FUZZ:-1%}"
SIZE="${SIZE:-384x384}"
QUALITY="${QUALITY:-88}"

if [[ -z "$SRC_DIR" || -z "$OUT_DIR" ]]; then
  echo "uso: $0 <dir-origen> <dir-destino> [patron]" >&2
  exit 1
fi

command -v convert >/dev/null || { echo "falta ImageMagick (apt install imagemagick)" >&2; exit 1; }

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

shopt -s nullglob
files=("$SRC_DIR"/$PATTERN)
[[ ${#files[@]} -gt 0 ]] || { echo "sin imagenes '$PATTERN' en $SRC_DIR" >&2; exit 1; }

for src in "${files[@]}"; do
  name="$(basename "$src" .png)"
  name="${name#*-}"

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
