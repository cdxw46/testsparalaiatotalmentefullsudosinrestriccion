#!/usr/bin/env python3
"""Telegram bot: buy Spain WhatsApp numbers via 5sim and relay SMS."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any

from dotenv import load_dotenv
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
)

from fivesim import FiveSim, FiveSimError

load_dotenv(Path(__file__).resolve().parent / ".env")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
log = logging.getLogger("telegram-5sim-bot")

FIVESIM_API_TOKEN = os.getenv("FIVESIM_API_TOKEN", "").strip()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
COUNTRY = os.getenv("COUNTRY", "spain").strip()
PRODUCT = os.getenv("PRODUCT", "whatsapp").strip()
OPERATOR_PREF = os.getenv("OPERATOR", "any").strip()
MAX_PRICE = float(os.getenv("MAX_PRICE", "2"))
SMS_POLL_SECONDS = float(os.getenv("SMS_POLL_SECONDS", "3"))
SMS_TIMEOUT_SECONDS = float(os.getenv("SMS_TIMEOUT_SECONDS", "300"))


@dataclass
class ChatOrder:
    order_id: int
    phone: str
    product: str
    country: str
    operator: str
    price: float | None
    chat_id: int
    message_thread_id: int | None = None
    task: asyncio.Task[None] | None = field(default=None, repr=False)


# chat_id -> last/active order
ORDERS: dict[int, ChatOrder] = {}


def require_config() -> None:
    missing = []
    if not FIVESIM_API_TOKEN:
        missing.append("FIVESIM_API_TOKEN")
    if not TELEGRAM_BOT_TOKEN:
        missing.append("TELEGRAM_BOT_TOKEN")
    if missing:
        raise SystemExit(
            "Faltan variables en .env: " + ", ".join(missing)
            + "\nCrea un bot con @BotFather y pon el token en TELEGRAM_BOT_TOKEN."
        )


def api(context: ContextTypes.DEFAULT_TYPE) -> FiveSim:
    return context.application.bot_data["fivesim"]


def fmt_sms_list(sms_list: Any) -> str:
    if not sms_list:
        return ""
    lines: list[str] = []
    if isinstance(sms_list, list):
        for item in sms_list:
            if isinstance(item, dict):
                code = item.get("code") or ""
                text = item.get("text") or item.get("message") or ""
                sender = item.get("sender") or item.get("created_at") or ""
                bit = " · ".join(x for x in [str(code), str(text), str(sender)] if x)
                if bit:
                    lines.append(bit)
            else:
                lines.append(str(item))
    else:
        lines.append(str(sms_list))
    return "\n".join(lines)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(
        "Bot 5sim listo.\n\n"
        f"Compra: {PRODUCT} / {COUNTRY} / max ${MAX_PRICE:.2f}\n\n"
        "Comandos:\n"
        "/buy — compra número y espera SMS\n"
        "/status — estado del último pedido\n"
        "/ban — banea el número (si no llega SMS)\n"
        "/balance — saldo 5sim\n"
        "/help — ayuda"
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await cmd_start(update, context)


async def cmd_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        profile = await api(context).profile()
    except FiveSimError as exc:
        await update.effective_message.reply_text(f"Error 5sim: {exc}")
        return
    balance = profile.get("balance", "?")
    rating = profile.get("rating", "?")
    await update.effective_message.reply_text(
        f"Saldo: ${balance}\nRating: {rating}"
    )


async def _stop_poll(chat_id: int) -> None:
    order = ORDERS.get(chat_id)
    if order and order.task and not order.task.done():
        order.task.cancel()
        try:
            await order.task
        except asyncio.CancelledError:
            pass


async def _poll_sms(
    app: Application,
    chat_order: ChatOrder,
) -> None:
    fivesim: FiveSim = app.bot_data["fivesim"]
    deadline = asyncio.get_running_loop().time() + SMS_TIMEOUT_SECONDS
    last_status = None

    try:
        while asyncio.get_running_loop().time() < deadline:
            try:
                data = await fivesim.check_order(chat_order.order_id)
            except FiveSimError as exc:
                log.warning("check failed: %s", exc)
                await asyncio.sleep(SMS_POLL_SECONDS)
                continue

            status = data.get("status")
            if status != last_status:
                last_status = status
                log.info("order %s status=%s", chat_order.order_id, status)

            sms_text = fmt_sms_list(data.get("sms"))
            if status == "RECEIVED" or sms_text:
                phone = data.get("phone") or chat_order.phone
                code = ""
                sms = data.get("sms") or []
                if isinstance(sms, list) and sms and isinstance(sms[0], dict):
                    code = str(sms[0].get("code") or "")

                msg = (
                    f"✅ SMS recibido\n"
                    f"Número: `{phone}`\n"
                    f"Pedido: `{chat_order.order_id}`\n"
                )
                if code:
                    msg += f"Código: `{code}`\n"
                if sms_text:
                    msg += f"\n{sms_text}"

                await app.bot.send_message(
                    chat_id=chat_order.chat_id,
                    text=msg,
                    parse_mode=ParseMode.MARKDOWN,
                    message_thread_id=chat_order.message_thread_id,
                )
                return

            if status in {"CANCELED", "TIMEOUT", "BANNED", "FINISHED"}:
                await app.bot.send_message(
                    chat_id=chat_order.chat_id,
                    text=(
                        f"Pedido `{chat_order.order_id}` finalizó con estado: {status}"
                    ),
                    parse_mode=ParseMode.MARKDOWN,
                    message_thread_id=chat_order.message_thread_id,
                )
                return

            await asyncio.sleep(SMS_POLL_SECONDS)

        await app.bot.send_message(
            chat_id=chat_order.chat_id,
            text=(
                f"⌛ Timeout esperando SMS ({int(SMS_TIMEOUT_SECONDS)}s).\n"
                f"Número: `{chat_order.phone}`\n"
                f"Pedido: `{chat_order.order_id}`\n"
                f"Usa /status o /ban."
            ),
            parse_mode=ParseMode.MARKDOWN,
            message_thread_id=chat_order.message_thread_id,
        )
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("poll crashed")
        await app.bot.send_message(
            chat_id=chat_order.chat_id,
            text="Error interno esperando el SMS. Prueba /status.",
            message_thread_id=chat_order.message_thread_id,
        )


async def cmd_buy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    message = update.effective_message
    if not chat or not message:
        return

    existing = ORDERS.get(chat.id)
    if existing and existing.task and not existing.task.done():
        await message.reply_text(
            f"Ya hay un pedido activo: `{existing.order_id}` (`{existing.phone}`).\n"
            f"Usa /status, /ban o espera el SMS.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    status_msg = await message.reply_text(
        f"Buscando {PRODUCT} en {COUNTRY} ≤ ${MAX_PRICE:.2f}..."
    )

    fivesim = api(context)
    try:
        try:
            await fivesim.set_max_price(PRODUCT, MAX_PRICE)
        except FiveSimError as exc:
            log.warning("max-price set failed: %s", exc)

        prices = await fivesim.prices(COUNTRY, PRODUCT)
        picked = fivesim.pick_operator(prices, COUNTRY, PRODUCT, MAX_PRICE)
        if not picked:
            await status_msg.edit_text(
                f"No hay stock de {PRODUCT} en {COUNTRY} a ≤ ${MAX_PRICE:.2f}."
            )
            return

        operator, cost = picked
        if OPERATOR_PREF and OPERATOR_PREF != "any":
            # Prefer configured operator only if it is affordable + in stock.
            for country_node in (prices.get(COUNTRY, {}), prices):
                product_node = country_node.get(PRODUCT, {})
                info = product_node.get(OPERATOR_PREF)
                if isinstance(info, dict):
                    try:
                        pref_cost = float(info.get("cost", 9999))
                        pref_count = int(info.get("count", 0))
                    except (TypeError, ValueError):
                        break
                    if pref_count > 0 and pref_cost <= MAX_PRICE:
                        operator, cost = OPERATOR_PREF, pref_cost
                    break

        await status_msg.edit_text(
            f"Comprando {PRODUCT} / {COUNTRY} / {operator} (~${cost:.4f})..."
        )
        order = await fivesim.buy_activation(COUNTRY, operator, PRODUCT)
    except FiveSimError as exc:
        await status_msg.edit_text(f"Error al comprar: {exc}")
        return

    order_id = order.get("id")
    phone = order.get("phone")
    if not order_id or not phone:
        await status_msg.edit_text(f"Respuesta inesperada de 5sim: {order}")
        return

    price = order.get("price", cost)
    chat_order = ChatOrder(
        order_id=int(order_id),
        phone=str(phone),
        product=PRODUCT,
        country=COUNTRY,
        operator=str(order.get("operator") or operator),
        price=float(price) if price is not None else None,
        chat_id=chat.id,
        message_thread_id=message.message_thread_id,
    )
    await _stop_poll(chat.id)
    task = asyncio.create_task(
        _poll_sms(context.application, chat_order),
        name=f"sms-poll-{order_id}",
    )
    chat_order.task = task
    ORDERS[chat.id] = chat_order

    price_txt = f"${float(price):.4f}" if price is not None else "?"
    await status_msg.edit_text(
        f"📱 Número comprado\n"
        f"Número: `{phone}`\n"
        f"Pedido: `{order_id}`\n"
        f"Operador: `{chat_order.operator}`\n"
        f"Precio: {price_txt}\n"
        f"Producto: {PRODUCT} / {COUNTRY}\n\n"
        f"⏳ Esperando SMS...\n"
        f"Si no llega: /ban",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    message = update.effective_message
    if not chat or not message:
        return

    order = ORDERS.get(chat.id)
    order_id = order.order_id if order else None
    if context.args:
        order_id = context.args[0]
    if not order_id:
        await message.reply_text("No hay pedido en este chat. Usa /buy.")
        return

    try:
        data = await api(context).check_order(order_id)
    except FiveSimError as exc:
        await message.reply_text(f"Error: {exc}")
        return

    sms_text = fmt_sms_list(data.get("sms"))
    text = (
        f"Pedido: `{data.get('id', order_id)}`\n"
        f"Número: `{data.get('phone', '?')}`\n"
        f"Estado: `{data.get('status', '?')}`\n"
        f"Producto: `{data.get('product', '?')}`\n"
        f"País: `{data.get('country', '?')}`\n"
    )
    if sms_text:
        text += f"\nSMS:\n{sms_text}"
    else:
        text += "\nAún sin SMS."
    await message.reply_text(text, parse_mode=ParseMode.MARKDOWN)


async def cmd_ban(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    message = update.effective_message
    if not chat or not message:
        return

    order = ORDERS.get(chat.id)
    order_id = order.order_id if order else None
    if context.args:
        order_id = context.args[0]
    if not order_id:
        await message.reply_text("No hay pedido para banear. Usa /buy o /ban <id>.")
        return

    await _stop_poll(chat.id)
    try:
        data = await api(context).ban_order(order_id)
    except FiveSimError as exc:
        await message.reply_text(f"Error al banear: {exc}")
        return

    status = data.get("status", "BANNED") if isinstance(data, dict) else "BANNED"
    phone = ""
    if isinstance(data, dict):
        phone = str(data.get("phone") or (order.phone if order else ""))
    elif order:
        phone = order.phone

    await message.reply_text(
        f"🚫 Número baneado\n"
        f"Pedido: `{order_id}`\n"
        f"Número: `{phone or '?'}`\n"
        f"Estado: `{status}`",
        parse_mode=ParseMode.MARKDOWN,
    )


async def on_startup(app: Application) -> None:
    fivesim = FiveSim(FIVESIM_API_TOKEN)
    app.bot_data["fivesim"] = fivesim
    try:
        profile = await fivesim.profile()
        log.info("5sim OK balance=%s", profile.get("balance"))
    except FiveSimError as exc:
        log.error("No se pudo validar token 5sim: %s", exc)


async def on_shutdown(app: Application) -> None:
    for chat_id in list(ORDERS):
        await _stop_poll(chat_id)
    fivesim: FiveSim | None = app.bot_data.get("fivesim")
    if fivesim:
        await fivesim.aclose()


def main() -> None:
    require_config()
    app = (
        Application.builder()
        .token(TELEGRAM_BOT_TOKEN)
        .post_init(on_startup)
        .post_shutdown(on_shutdown)
        .build()
    )
    app.add_handler(CommandHandler(["start", "help"], cmd_start))
    app.add_handler(CommandHandler("balance", cmd_balance))
    app.add_handler(CommandHandler("buy", cmd_buy))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("ban", cmd_ban))
    log.info(
        "Starting bot country=%s product=%s max_price=%s",
        COUNTRY,
        PRODUCT,
        MAX_PRICE,
    )
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
