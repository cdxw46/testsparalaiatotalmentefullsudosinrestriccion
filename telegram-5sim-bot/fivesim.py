"""Minimal 5sim.net API client."""

from __future__ import annotations

from typing import Any

import httpx


ERROR_ES = {
    "no free phones": "No hay números disponibles ahora mismo en 5sim (stock vacío). No es un número gratis.",
    "not enough user balance": "Saldo insuficiente en 5sim.",
    "not enough rating": "Rating insuficiente en 5sim.",
    "bad country": "País incorrecto.",
    "bad operator": "Operador incorrecto.",
    "no product": "Producto no disponible.",
    "server offline": "Servidor 5sim caído.",
    "order not found": "Pedido no encontrado.",
}


class FiveSimError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        self.raw_message = str(message).strip()
        self.status_code = status_code
        nice = ERROR_ES.get(self.raw_message.lower(), self.raw_message)
        super().__init__(nice)


class FiveSim:
    BASE = "https://5sim.net/v1"

    def __init__(self, token: str, timeout: float = 30.0):
        self._client = httpx.AsyncClient(
            base_url=self.BASE,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "User-Agent": "telegram-5sim-bot/1.0",
            },
            timeout=timeout,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = await self._client.request(method, path, **kwargs)
        body = response.text.strip()
        if response.status_code >= 400:
            raise FiveSimError(body or response.reason_phrase, response.status_code)
        if not body:
            return None
        try:
            data = response.json()
        except ValueError as exc:
            raise FiveSimError(body) from exc
        if isinstance(data, str):
            if data.lower() in {"success", "ok"}:
                return {"status": data}
            raise FiveSimError(data)
        return data

    async def profile(self) -> dict[str, Any]:
        return await self._request("GET", "/user/profile")

    async def set_max_price(self, product_name: str, price: float) -> Any:
        return await self._request(
            "POST",
            "/user/max-prices",
            json={"product_name": product_name, "price": price},
        )

    async def prices(self, country: str, product: str) -> dict[str, Any]:
        return await self._request(
            "GET",
            "/guest/prices",
            params={"country": country, "product": product},
        )

    def list_operators(
        self,
        prices_payload: dict[str, Any],
        country: str,
        product: str,
        max_price: float,
    ) -> list[tuple[str, float, float, int]]:
        """Return [(operator, cost, rate, count), ...] affordable with stock."""
        country_node = prices_payload.get(country, prices_payload)
        if not isinstance(country_node, dict):
            return []
        product_node = country_node.get(product, country_node)
        if not isinstance(product_node, dict):
            return []

        out: list[tuple[str, float, float, int]] = []
        for operator, info in product_node.items():
            if not isinstance(info, dict):
                continue
            try:
                cost = float(info.get("cost", 9999))
                count = int(info.get("count", 0))
                rate = float(info.get("rate") or 0)
            except (TypeError, ValueError):
                continue
            if count > 0 and cost <= max_price:
                out.append((operator, cost, rate, count))
        # Prefer higher rate, then cheaper
        out.sort(key=lambda row: (-row[2], row[1], -row[3]))
        return out

    def pick_operator(
        self,
        prices_payload: dict[str, Any],
        country: str,
        product: str,
        max_price: float,
        min_rate: float = 0.0,
    ) -> tuple[str, float, float] | None:
        ops = self.list_operators(prices_payload, country, product, max_price)
        if not ops:
            return None
        good = [o for o in ops if o[2] >= min_rate and o[2] > 0]
        chosen = (good or ops)[0]
        return chosen[0], chosen[1], chosen[2]

    async def buy_activation(
        self, country: str, operator: str, product: str
    ) -> dict[str, Any]:
        path = f"/user/buy/activation/{country}/{operator}/{product}"
        return await self._request("GET", path)

    async def check_order(self, order_id: int | str) -> dict[str, Any]:
        return await self._request("GET", f"/user/check/{order_id}")

    async def ban_order(self, order_id: int | str) -> dict[str, Any]:
        return await self._request("GET", f"/user/ban/{order_id}")

    async def cancel_order(self, order_id: int | str) -> dict[str, Any]:
        return await self._request("GET", f"/user/cancel/{order_id}")
