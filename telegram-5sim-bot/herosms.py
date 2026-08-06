"""HeroSMS API client (SMS-Activate compatible handler_api)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


ERROR_ES = {
    "NO_NUMBERS": "No hay números disponibles ahora en HeroSMS.",
    "NO_BALANCE": "Saldo insuficiente en HeroSMS.",
    "BAD_SERVICE": "Servicio incorrecto.",
    "BAD_KEY": "API key de HeroSMS inválida.",
    "ERROR_SQL": "Error interno HeroSMS.",
    "BANNED": "Cuenta HeroSMS baneada.",
    "WRONG_MAX_PRICE": "Precio por encima del máximo.",
    "MAX_PRICE_EXCEEDED": "Precio por encima del máximo.",
    "NO_ACTIVATION": "Activación no encontrada.",
    "STATUS_CANCEL": "Pedido cancelado.",
}


class HeroSMSError(Exception):
    def __init__(self, message: str):
        self.raw_message = str(message).strip()
        nice = ERROR_ES.get(self.raw_message, ERROR_ES.get(self.raw_message.upper(), self.raw_message))
        super().__init__(nice)


@dataclass
class HeroOrder:
    id: str
    phone: str
    country_id: int
    service: str
    status: str = "PENDING"
    code: str | None = None
    price: float | None = None


class HeroSMS:
    BASE = "https://hero-sms.com/stubs/handler_api.php"

    def __init__(self, api_key: str, timeout: float = 30.0):
        self.api_key = api_key
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={"User-Agent": "telegram-herosms-bot/1.0"},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _call(self, **params: Any) -> str:
        params = {"api_key": self.api_key, **params}
        response = await self._client.get(self.BASE, params=params)
        text = response.text.strip()
        if response.status_code >= 400:
            raise HeroSMSError(text or response.reason_phrase)
        return text

    async def balance(self) -> float:
        text = await self._call(action="getBalance")
        if text.startswith("ACCESS_BALANCE:"):
            return float(text.split(":", 1)[1])
        raise HeroSMSError(text)

    async def get_price(self, service: str, country: int) -> dict[str, Any] | None:
        text = await self._call(action="getPrices", service=service, country=country)
        try:
            import json

            data = json.loads(text)
        except ValueError as exc:
            raise HeroSMSError(text) from exc
        node = data.get(str(country), {})
        info = node.get(service)
        if not isinstance(info, dict):
            return None
        return {
            "cost": float(info.get("cost", 0)),
            "count": int(info.get("count", 0)),
            "physicalCount": int(info.get("physicalCount") or 0),
        }

    async def buy_number(
        self,
        service: str,
        country: int,
        max_price: float | None = None,
    ) -> HeroOrder:
        params: dict[str, Any] = {
            "action": "getNumber",
            "service": service,
            "country": country,
        }
        if max_price is not None:
            params["maxPrice"] = max_price
        text = await self._call(**params)
        if text.startswith("ACCESS_NUMBER:"):
            # ACCESS_NUMBER:id:phone
            parts = text.split(":")
            order_id = parts[1]
            phone = parts[2] if len(parts) > 2 else ""
            if phone and not phone.startswith("+"):
                phone = "+" + phone
            return HeroOrder(
                id=order_id,
                phone=phone,
                country_id=country,
                service=service,
                status="PENDING",
                price=max_price,
            )
        raise HeroSMSError(text)

    async def get_status(self, order_id: str) -> tuple[str, str | None]:
        """Return (status, code_or_none).

        status: WAIT_CODE | OK | CANCEL | WAIT_RETRY | UNKNOWN
        """
        text = await self._call(action="getStatus", id=order_id)
        if text.startswith("STATUS_OK"):
            # STATUS_OK:code  (code may contain :)
            code = text.split(":", 1)[1] if ":" in text else ""
            return "OK", code.strip()
        if text == "STATUS_WAIT_CODE":
            return "WAIT_CODE", None
        if text == "STATUS_WAIT_RETRY":
            return "WAIT_RETRY", None
        if text == "STATUS_CANCEL":
            return "CANCEL", None
        if text.startswith("STATUS_WAIT_CODE"):
            return "WAIT_CODE", None
        raise HeroSMSError(text)

    async def cancel(self, order_id: str) -> str:
        # SMS-Activate: status=8 cancel
        text = await self._call(action="setStatus", id=order_id, status=8)
        return text

    async def finish(self, order_id: str) -> str:
        # SMS-Activate: status=6 complete
        text = await self._call(action="setStatus", id=order_id, status=6)
        return text
