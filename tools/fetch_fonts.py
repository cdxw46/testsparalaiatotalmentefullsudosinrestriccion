#!/usr/bin/env python3
"""Descarga los subconjuntos latinos de las fuentes del juego y los deja en
`public/fonts` junto a un CSS local, para que el juego no dependa de la red."""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

FAMILIES = "family=Baloo+2:wght@400;600;700;800&family=Nunito:wght@400;700;900"
CSS_URL = f"https://fonts.googleapis.com/css2?{FAMILIES}&display=swap"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "fonts"

BLOCK = re.compile(r"/\*\s*(?P<subset>[a-z0-9\-\[\] ]+)\s*\*/\s*@font-face\s*\{(?P<body>[^}]*)\}", re.I)


def curl(url: str) -> bytes:
    result = subprocess.run(
        ["curl", "-sSL", "--max-time", "40", "-A", UA, url],
        capture_output=True,
        check=True,
    )
    return result.stdout


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    css = curl(CSS_URL).decode()
    faces: list[str] = []

    for match in BLOCK.finditer(css):
        if match.group("subset").strip() != "latin":
            continue
        body = match.group("body")
        family = re.search(r"font-family:\s*'([^']+)'", body).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
        style = re.search(r"font-style:\s*(\w+)", body).group(1)
        url = re.search(r"url\((https://[^)]+)\)", body).group(1)

        slug = family.lower().replace(" ", "-").replace("+", "-")
        name = f"{slug}-{weight}.woff2"
        (OUT / name).write_bytes(curl(url))
        print(f"  {family} {weight} -> {name} ({(OUT / name).stat().st_size // 1024} KB)")
        faces.append(
            "@font-face {\n"
            f"  font-family: '{family}';\n"
            f"  font-style: {style};\n"
            f"  font-weight: {weight};\n"
            "  font-display: swap;\n"
            f"  src: url('./{name}') format('woff2');\n"
            "}\n"
        )

    if not faces:
        print("no se encontraron subconjuntos latinos", file=sys.stderr)
        return 1

    (OUT / "fonts.css").write_text(
        "/* Generado por tools/fetch_fonts.py — subconjuntos latinos de Google Fonts */\n\n"
        + "\n".join(faces)
    )
    print(f"  css -> {OUT / 'fonts.css'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
