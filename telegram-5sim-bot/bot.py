#!/usr/bin/env python3
"""Telegram bot: buy Spain WhatsApp numbers via HeroSMS and relay SMS."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from telegram import BotCommand, Update
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes

from herosms import HeroSMS, HeroSMSError

load_dotenv(Path(__file__).resolve().parent / ".env")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
log = logging.getLogger("telegram-herosms-bot")

HEROSMS_API_KEY = os.getenv("HEROSMS_API_KEY", "").strip()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
COUNTRY_ID = int(os.getenv("COUNTRY_ID", "56"))  # Spain
COUNTRY = os.getenv("COUNTRY", "spain").strip()
SERVICE_CODE = os.getenv("SERVICE_CODE", "wa").strip()  # WhatsApp
PRODUCT = os.getenv("PRODUCT", "whatsapp").strip()
MAX_PRICE = float(os.getenv("MAX_PRICE", "3"))
SMS_POLL_SECONDS = float(os.getenv("SMS_POLL_SECONDS", "5"))
SMS_TIMEOUT_SECONDS = float(os.getenv("SMS_TIMEOUT_SECONDS", "1200"))
PROGRESS_EVERY_SECONDS = float(os.getenv("PROGRESS_EVERY_SECONDS", "30"))


@dataclass
class ChatOrder:
    order_id: str
    phone: str
    service: str
    country_id: int
    price: float | None
    chat_id: int
    message_thread_id: int | None = None
    task: asyncio.Task[None] | None = field(default=None, repr=False)


ORDERS: dict[int, ChatOrder] = {}
BUY_LOCKS: dict[int, asyncio.Lock] = {}


def require_config() -> None:
    missing = []
    if not HEROSMS_API_KEY:
        missing.append("HEROSMS_API_KEY")
    if not TELEGRAM_BOT_TOKEN:
        missing.append("TELEGRAM_BOT_TOKEN")
    if missing:
        raise SystemExit("Faltan variables en .env: " + ", ".join(missing))


def api(context: ContextTypes.DEFAULT_TYPE) -> HeroSMS:
    return context.application.bot_data["herosms"]


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(
        "Bot HeroSMS listo.\n\n"
        f"Compra: {PRODUCT} / {COUNTRY} (id {COUNTRY_ID}) / max ${MAX_PRICE:.2f}\n\n"
        "Comandos:\n"
        "/buy — compra número y espera SMS\n"
        "/status — estado del pedido\n"
        "/ban — cancela/banea si no llega SMS (refund)\n"
        "/balance — saldo HeroSMS\n"
        "/help — ayuda"
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await cmd_start(update, context)


async def cmd_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        bal = await api(context).balance()
        price = await api(context).get_price(SERVICE_CODE, COUNTRY_ID)
    except HeroSMSError as exc:
        await update.effective_message.reply_text(f"Error HeroSMS: {exc}")
        return
    stock = "?"
    cost = "?"
    if price:
        stock = str(price.get("count"))
        cost = f"${float(price.get('cost', 0)):.4f}"
    await update.effective_message.reply_text(
        f"Saldo HeroSMS: ${bal:.4f}\n"
        f"{PRODUCT}/{COUNTRY}: {cost} · stock {stock}"
    )


async def _stop_poll(chat_id: int) -> None:
    order = ORDERS.get(chat_id)
    if order and order.task and not order.task.done():
        order.task.cancel()
        try:
            await order.task
        except asyncio.CancelledError:
            pass


async def _poll_sms(app: Application, chat_order: ChatOrder) -> None:
    herosms: HeroSMS = app.bot_data["herosms"]
    loop = asyncio.get_running_loop()
    deadline = loop.time() + SMS_TIMEOUT_SECONDS
    started = loop.time()
    last_progress = started

    try:
        while loop.time() < deadline:
            try:
                status, code = await herosms.get_status(chat_order.order_id)
            except HeroSMSError as exc:
                log.warning("getStatus failed: %s", exc)
                await asyncio.sleep(SMS_POLL_SECONDS)
                continue

            if status == "OK" and code:
                try:
                    await herosms.finish(chat_order.order_id)
                except HeroSMSError as exc:
                    log.warning("finish failed: %s", exc)
                await app.bot.send_message(
                    chat_id=chat_order.chat_id,
                    text=(
                        f"✅ SMS recibido\n"
                        f"Número: `{chat_order.phone}`\n"
                        f"Pedido: `{chat_order.order_id}`\n"
                        f"Código: `{code}`"
                    ),
                    parse_mode=ParseMode.MARKDOWN,
                    message_thread_id=chat_order.message_thread_id,
                )
                return

            if status == "CANCEL":
                await app.bot.send_message(
                    chat_id=chat_order.chat_id,
                    text=(
                        f"Pedido `{chat_order.order_id}` cancelado en HeroSMS."
                    ),
                    parse_mode=ParseMode.MARKDOWN,
                    message_thread_id=chat_order.message_thread_id,
                )
                return

            now = loop.time()
            if now - last_progress >= PROGRESS_EVERY_SECONDS:
                last_progress = now
                waited = int(now - started)
                await app.bot.send_message(
                    chat_id=chat_order.chat_id,
                    text=(
                        f"⌛ Esperando SMS... ({waited}s)\n"
                        f"Número: `{chat_order.phone}`\n"
                        f"Pedido: `{chat_order.order_id}`\n"
                        f"Estado: `{status}`"
                    ),
                    parse_mode=ParseMode.MARKDOWN,
                    message_thread_id=chat_order.message_thread_id,
                )

            await asyncio.sleep(SMS_POLL_SECONDS)

        # timeout -> cancel for refund
        try:
            cancel_res = await herosms.cancel(chat_order.order_id)
        except HeroSMSError as exc:
            cancel_res = str(exc)
        await app.bot.send_message(
            chat_id=chat_order.chat_id,
            text=(
                f"⌛ Timeout sin SMS ({int(SMS_TIMEOUT_SECONDS)}s).\n"
                f"Número: `{chat_order.phone}`\n"
                f"Pedido: `{chat_order.order_id}`\n"
                f"Auto-cancel: `{cancel_res}`"
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
            text="Error interno esperando SMS. Usa /status o /ban.",
            message_thread_id=chat_order.message_thread_id,
        )


async def cmd_buy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    message = update.effective_message
    if not chat or not message:
        return

    lock = BUY_LOCKS.setdefault(chat.id, asyncio.Lock())
    if lock.locked():
        await message.reply_text("Ya hay una compra en curso, espera...")
        return

    async with lock:
        existing = ORDERS.get(chat.id)
        if existing and existing.task and not existing.task.done():
            await message.reply_text(
                f"Ya hay pedido activo: `{existing.order_id}` (`{existing.phone}`).\n"
                f"Usa /status, /ban o espera el SMS.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return

        status_msg = await message.reply_text(
            f"Buscando {PRODUCT} en {COUNTRY} ≤ ${MAX_PRICE:.2f} (HeroSMS)..."
        )
        herosms = api(context)

        try:
            price_info = await herosms.get_price(SERVICE_CODE, COUNTRY_ID)
            if not price_info or int(price_info.get("count") or 0) <= 0:
                await status_msg.edit_text(
                    f"Sin stock HeroSMS de {PRODUCT}/{COUNTRY}."
                )
                return
            cost = float(price_info["cost"])
            if cost > MAX_PRICE:
                await status_msg.edit_text(
                    f"Precio actual ${cost:.4f} > max ${MAX_PRICE:.2f}. "
                    f"Stock: {price_info.get('count')}"
                )
                return

            await status_msg.edit_text(
                f"Comprando {PRODUCT}/{COUNTRY} ~${cost:.4f} "
                f"(stock {price_info.get('count')})..."
            )
            order = await herosms.buy_number(
                SERVICE_CODE, COUNTRY_ID, max_price=MAX_PRICE
            )
        except HeroSMSError as exc:
            await status_msg.edit_text(f"Error al comprar: {exc}")
            return

        chat_order = ChatOrder(
            order_id=str(order.id),
            phone=order.phone,
            service=SERVICE_CODE,
            country_id=COUNTRY_ID,
            price=cost,
            chat_id=chat.id,
            message_thread_id=message.message_thread_id,
        )
        await _stop_poll(chat.id)
        task = asyncio.create_task(
            _poll_sms(context.application, chat_order),
            name=f"sms-poll-{order.id}",
        )
        chat_order.task = task
        ORDERS[chat.id] = chat_order

        await status_msg.edit_text(
            f"📱 Número comprado (HeroSMS)\n"
            f"Número: `{order.phone}`\n"
            f"Pedido: `{order.id}`\n"
            f"Precio: ~${cost:.4f}\n"
            f"Producto: {PRODUCT} / {COUNTRY}\n\n"
            f"⏳ Esperando SMS... consulto cada {int(SMS_POLL_SECONDS)}s\n"
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
        await message.reply_text("No hay pedido. Usa /buy.")
        return

    try:
        status, code = await api(context).get_status(order_id)
    except HeroSMSError as exc:
        await message.reply_text(f"Error: {exc}")
        return

    phone = order.phone if order else "?"
    text = (
        f"Pedido: `{order_id}`\n"
        f"Número: `{phone}`\n"
        f"Estado: `{status}`\n"
    )
    if code:
        text += f"Código: `{code}`"
    else:
        text += "Aún sin SMS."
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
        await message.reply_text("No hay pedido. Usa /buy o /ban <id>.")
        return

    await _stop_poll(chat.id)
    herosms = api(context)
    try:
        res = await herosms.cancel(order_id)
        bal = await herosms.balance()
    except HeroSMSError as exc:
        await message.reply_text(f"Error al cancelar: {exc}")
        return

    phone = order.phone if order else "?"
    await message.reply_text(
        f"🚫 Pedido cancelado (refund HeroSMS)\n"
        f"Pedido: `{order_id}`\n"
        f"Número: `{phone}`\n"
        f"Respuesta: `{res}`\n"
        f"Saldo ahora: `${bal:.4f}`",
        parse_mode=ParseMode.MARKDOWN,
    )


async def on_startup(app: Application) -> None:
    herosms = HeroSMS(HEROSMS_API_KEY)
    app.bot_data["herosms"] = herosms
    await app.bot.set_my_commands(
        [
            BotCommand("buy", f"Comprar {PRODUCT} {COUNTRY} (max ${MAX_PRICE:.0f})"),
            BotCommand("status", "Ver estado / SMS"),
            BotCommand("ban", "Cancelar si no llega SMS"),
            BotCommand("balance", "Saldo HeroSMS"),
            BotCommand("help", "Ayuda"),
        ]
    )
    try:
        bal = await herosms.balance()
        price = await herosms.get_price(SERVICE_CODE, COUNTRY_ID)
        log.info(
            "HeroSMS OK balance=%s spain_wa=%s",
            bal,
            price,
        )
    except HeroSMSError as exc:
        log.error("HeroSMS token invalid: %s", exc)


async def on_shutdown(app: Application) -> None:
    for chat_id in list(ORDERS):
        await _stop_poll(chat_id)
    herosms: HeroSMS | None = app.bot_data.get("herosms")
    if herosms:
        await herosms.aclose()


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
        "Starting HeroSMS bot country_id=%s service=%s max_price=%s",
        COUNTRY_ID,
        SERVICE_CODE,
        MAX_PRICE,
    )
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
