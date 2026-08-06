"""Minimal 5sim.net API client."""

from __future__ import annotations

from typing import Any

import httpx


class FiveSimError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


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
        text = response.text.strip()
        if response.status_code >= 400:
            raise FiveSimError(text or response.reason_phrase, response.status_code)
        if not text:
            return None
        try:
            return response.json()
        except ValueError:
            return text

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

    def pick_operator(
        self,
        prices_payload: dict[str, Any],
        country: str,
        product: str,
        max_price: float,
    ) -> tuple[str, float] | None:
        """Return (operator, cost) with stock and cost <= max_price, cheapest first."""
        country_node = prices_payload.get(country, prices_payload)
        product_node = country_node.get(product, country_node)
        if not isinstance(product_node, dict):
            return None

        candidates: list[tuple[float, int, str]] = []
        for operator, info in product_node.items():
            if not isinstance(info, dict):
                continue
            try:
                cost = float(info.get("cost", 9999))
                count = int(info.get("count", 0))
            except (TypeError, ValueError):
                continue
            if count > 0 and cost <= max_price:
                candidates.append((cost, count, operator))

        if not candidates:
            return None
        candidates.sort(key=lambda row: (row[0], -row[1]))
        cost, _count, operator = candidates[0]
        return operator, cost

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
