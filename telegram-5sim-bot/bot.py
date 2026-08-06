#!/usr/bin/env python3
"""Telegram bot: buy Spain WhatsApp numbers via 5sim and relay SMS."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from telegram import BotCommand, Update
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes

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
MAX_PRICE = float(os.getenv("MAX_PRICE", "3"))
MIN_RATE = float(os.getenv("MIN_RATE", "0"))
SMS_POLL_SECONDS = float(os.getenv("SMS_POLL_SECONDS", "5"))
SMS_TIMEOUT_SECONDS = float(os.getenv("SMS_TIMEOUT_SECONDS", "300"))
# If 5sim marks RECEIVED without SMS body, wait this long then auto-ban.
EMPTY_RECEIVED_GRACE_SECONDS = float(os.getenv("EMPTY_RECEIVED_GRACE_SECONDS", "0"))


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


ORDERS: dict[int, ChatOrder] = {}
BUY_LOCKS: dict[int, asyncio.Lock] = {}


def require_config() -> None:
    missing = []
    if not FIVESIM_API_TOKEN:
        missing.append("FIVESIM_API_TOKEN")
    if not TELEGRAM_BOT_TOKEN:
        missing.append("TELEGRAM_BOT_TOKEN")
    if missing:
        raise SystemExit(
            "Faltan variables en .env: "
            + ", ".join(missing)
            + "\nCrea un bot con @BotFather y pon el token en TELEGRAM_BOT_TOKEN."
        )


def api(context: ContextTypes.DEFAULT_TYPE) -> FiveSim:
    return context.application.bot_data["fivesim"]


def extract_sms(sms_list: Any) -> tuple[str, str]:
    """Return (code, readable_text). Only real SMS content counts."""
    if not sms_list or not isinstance(sms_list, list):
        return "", ""
    codes: list[str] = []
    lines: list[str] = []
    for item in sms_list:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or "").strip()
        text = str(item.get("text") or item.get("message") or "").strip()
        sender = str(item.get("sender") or "").strip()
        if code:
            codes.append(code)
        bit = " · ".join(x for x in [code, text, sender] if x)
        if bit:
            lines.append(bit)
    return (codes[0] if codes else ""), "\n".join(lines)


def has_real_sms(data: dict[str, Any]) -> bool:
    code, text = extract_sms(data.get("sms"))
    return bool(code or text)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(
        "Bot 5sim listo.\n\n"
        f"Compra: {PRODUCT} / {COUNTRY} / max ${MAX_PRICE:.2f} / prioridad rate>0\n\n"
        "Comandos:\n"
        "/buy — compra número y espera SMS\n"
        "/status — estado del último pedido\n"
        "/ban — banea el número (si no llega SMS)\n"
        "/balance — saldo 5sim\n"
        "/stock — ver operadores\n"
        "/help — ayuda\n\n"
        "Solo avisa SMS si llega código/texto real."
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


async def _auto_ban(fivesim: FiveSim, order_id: int) -> dict[str, Any] | None:
    try:
        return await fivesim.ban_order(order_id)
    except FiveSimError as exc:
        log.warning("auto-ban failed for %s: %s", order_id, exc)
        return None


async def _poll_sms(app: Application, chat_order: ChatOrder) -> None:
    fivesim: FiveSim = app.bot_data["fivesim"]
    deadline = asyncio.get_running_loop().time() + SMS_TIMEOUT_SECONDS
    empty_received_since: float | None = None
    last_status = None

    try:
        while asyncio.get_running_loop().time() < deadline:
            try:
                data = await fivesim.check_order(chat_order.order_id)
            except FiveSimError as exc:
                log.warning("check failed: %s", exc)
                await asyncio.sleep(SMS_POLL_SECONDS)
                continue

            status = str(data.get("status") or "")
            if status != last_status:
                last_status = status
                log.info(
                    "order %s status=%s sms_len=%s",
                    chat_order.order_id,
                    status,
                    len(data.get("sms") or []),
                )

            # ONLY success when there is real SMS content.
            if has_real_sms(data):
                phone = data.get("phone") or chat_order.phone
                code, sms_text = extract_sms(data.get("sms"))
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

            # RECEIVED without SMS body yet: keep polling, do not celebrate.
            # Auto-ban only if EMPTY_RECEIVED_GRACE_SECONDS > 0.
            if status == "RECEIVED" and EMPTY_RECEIVED_GRACE_SECONDS > 0:
                now = asyncio.get_running_loop().time()
                if empty_received_since is None:
                    empty_received_since = now
                    await app.bot.send_message(
                        chat_id=chat_order.chat_id,
                        text=(
                            "⚠️ 5sim marcó RECEIVED pero aún no hay SMS/código.\n"
                            f"Sigo consultando cada {int(SMS_POLL_SECONDS)}s..."
                        ),
                        message_thread_id=chat_order.message_thread_id,
                    )
                elif now - empty_received_since >= EMPTY_RECEIVED_GRACE_SECONDS:
                    banned = await _auto_ban(fivesim, chat_order.order_id)
                    st = banned.get("status") if isinstance(banned, dict) else "BANNED?"
                    await app.bot.send_message(
                        chat_id=chat_order.chat_id,
                        text=(
                            "🚫 Timeout de RECEIVED sin SMS.\n"
                            f"Auto-ban pedido `{chat_order.order_id}` → `{st}`"
                        ),
                        parse_mode=ParseMode.MARKDOWN,
                        message_thread_id=chat_order.message_thread_id,
                    )
                    return
            elif status != "RECEIVED":
                empty_received_since = None

            if status in {"CANCELED", "TIMEOUT", "BANNED", "FINISHED"}:
                # FINISHED without SMS is also not success for us
                if status == "FINISHED" and not has_real_sms(data):
                    await app.bot.send_message(
                        chat_id=chat_order.chat_id,
                        text=(
                            f"Pedido `{chat_order.order_id}` en FINISHED sin SMS. "
                            "Revisa /balance."
                        ),
                        parse_mode=ParseMode.MARKDOWN,
                        message_thread_id=chat_order.message_thread_id,
                    )
                    return
                if status != "FINISHED":
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

        # timeout: ban to try refund
        banned = await _auto_ban(fivesim, chat_order.order_id)
        st = banned.get("status") if isinstance(banned, dict) else "timeout"
        await app.bot.send_message(
            chat_id=chat_order.chat_id,
            text=(
                f"⌛ Timeout sin SMS real ({int(SMS_TIMEOUT_SECONDS)}s).\n"
                f"Número: `{chat_order.phone}`\n"
                f"Pedido: `{chat_order.order_id}`\n"
                f"Auto-ban: `{st}`"
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
            text="Error interno esperando el SMS. Prueba /status o /ban.",
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
            ops = fivesim.list_operators(prices, COUNTRY, PRODUCT, MAX_PRICE)
            # Paid numbers only. Try listed operators first, then 'any'.
            candidates: list[tuple[str, float | None, float | None]] = []
            for operator, cost, rate, _count in ops:
                candidates.append((operator, cost, rate))
            candidates.append(("any", None, None))
            # de-dup preserving order
            seen: set[str] = set()
            uniq: list[tuple[str, float | None, float | None]] = []
            for row in candidates:
                if row[0] in seen:
                    continue
                seen.add(row[0])
                uniq.append(row)
            candidates = uniq

            if len(candidates) == 1 and not ops:
                await status_msg.edit_text(
                    f"No hay stock listado de {PRODUCT} en {COUNTRY} a ≤ ${MAX_PRICE:.2f}."
                )
                return

            order: dict[str, Any] | None = None
            chosen_op = "any"
            chosen_cost: float | None = None
            chosen_rate: float | None = None
            attempts: list[str] = []
            max_attempts = min(6, len(candidates))

            for idx, (operator, cost, rate) in enumerate(candidates[:max_attempts]):
                label = operator if cost is None else f"{operator} ~${cost:.4f} rate={rate:.2f}%"
                await status_msg.edit_text(
                    f"Intento {idx+1}/{max_attempts}: {PRODUCT}/{COUNTRY}/{label}"
                )
                try:
                    bought = await fivesim.buy_activation(COUNTRY, operator, PRODUCT)
                except FiveSimError as exc:
                    msg = str(exc)
                    attempts.append(f"{operator}: {msg}")
                    log.warning("buy failed %s: %s", operator, msg)
                    # no free phones / not enough money / etc -> try next
                    continue

                if not isinstance(bought, dict):
                    attempts.append(f"{operator}: bad response {bought}")
                    continue

                oid = bought.get("id")
                phone = bought.get("phone")
                status = str(bought.get("status") or "")
                if not oid or not phone:
                    attempts.append(f"{operator}: incomplete {bought}")
                    continue

                # Accept the number even if 5sim status is RECEIVED.
                # We only care about real SMS code/text while polling.
                order = bought
                chosen_op = str(bought.get("operator") or operator)
                chosen_cost = float(bought.get("price") if bought.get("price") is not None else (cost or 0))
                chosen_rate = rate
                break

            if order is None:
                detail = "\n".join(f"• {a}" for a in attempts[:8]) or "sin detalle"
                await status_msg.edit_text(
                    "No pude sacar un número usable.\n"
                    f"{PRODUCT}/{COUNTRY} ≤ ${MAX_PRICE:.2f}\n\n"
                    f"{detail}\n\n"
                    "Eso NO son números gratis: en 5sim 'no free phones' = sin stock.
"
                    "Prueba /buy más tarde o sube MAX_PRICE."
                )
                return

        except FiveSimError as exc:
            await status_msg.edit_text(f"Error al comprar: {exc}")
            return

        order_id = order.get("id")
        phone = order.get("phone")
        if not order_id or not phone:
            await status_msg.edit_text(f"Respuesta inesperada de 5sim: {order}")
            return

        if has_real_sms(order):
            code, sms_text = extract_sms(order.get("sms"))
            msg = (
                f"✅ Número con SMS ya incluido\n"
                f"Número: `{phone}`\nPedido: `{order_id}`\n"
            )
            if code:
                msg += f"Código: `{code}`\n"
            if sms_text:
                msg += f"\n{sms_text}"
            await status_msg.edit_text(msg, parse_mode=ParseMode.MARKDOWN)
            return

        price = order.get("price", chosen_cost)
        chat_order = ChatOrder(
            order_id=int(order_id),
            phone=str(phone),
            product=PRODUCT,
            country=COUNTRY,
            operator=chosen_op,
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
        rate_txt = f"{chosen_rate:.2f}%" if chosen_rate is not None else "?"
        await status_msg.edit_text(
            f"📱 Número comprado — úsalo ya en WhatsApp\n"
            f"Número: `{phone}`\n"
            f"Pedido: `{order_id}`\n"
            f"Operador: `{chat_order.operator}`\n"
            f"Precio: {price_txt}\n"
            f"Rate: {rate_txt}\n"
            f"Producto: {PRODUCT} / {COUNTRY}\n\n"
            f"⏳ Esperando el SMS de WhatsApp...\n"
            f"Consulto 5sim cada {int(SMS_POLL_SECONDS)}s hasta que llegue el código.\n"
            f"(Ignoro el estado RECEIVED vacío; solo cuenta SMS con texto/código)\n"
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

    code, sms_text = extract_sms(data.get("sms"))
    text = (
        f"Pedido: `{data.get('id', order_id)}`\n"
        f"Número: `{data.get('phone', '?')}`\n"
        f"Estado: `{data.get('status', '?')}`\n"
        f"Producto: `{data.get('product', '?')}`\n"
        f"País: `{data.get('country', '?')}`\n"
        f"SMS count: `{len(data.get('sms') or [])}`\n"
    )
    if code:
        text += f"Código: `{code}`\n"
    if sms_text:
        text += f"\nSMS:\n{sms_text}"
    else:
        text += "\nAún sin SMS real."
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
    fivesim = api(context)
    try:
        data = await fivesim.ban_order(order_id)
    except FiveSimError as exc:
        # fallback cancel
        try:
            data = await fivesim.cancel_order(order_id)
        except FiveSimError as exc2:
            await message.reply_text(f"Error al banear/cancelar: {exc} / {exc2}")
            return

    status = data.get("status", "BANNED") if isinstance(data, dict) else "BANNED"
    phone = ""
    if isinstance(data, dict):
        phone = str(data.get("phone") or (order.phone if order else ""))
    elif order:
        phone = order.phone

    try:
        profile = await fivesim.profile()
        bal = profile.get("balance", "?")
    except FiveSimError:
        bal = "?"

    await message.reply_text(
        f"🚫 Número baneado/cancelado\n"
        f"Pedido: `{order_id}`\n"
        f"Número: `{phone or '?'}`\n"
        f"Estado: `{status}`\n"
        f"Saldo ahora: `${bal}`",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_stock(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        prices = await api(context).prices(COUNTRY, PRODUCT)
        ops = api(context).list_operators(prices, COUNTRY, PRODUCT, MAX_PRICE)
    except FiveSimError as exc:
        await update.effective_message.reply_text(f"Error: {exc}")
        return
    if not ops:
        await update.effective_message.reply_text(
            f"Sin stock ≤ ${MAX_PRICE:.2f} para {PRODUCT}/{COUNTRY}"
        )
        return
    lines = [f"Stock {PRODUCT}/{COUNTRY} ≤ ${MAX_PRICE:.2f}:"]
    for op, cost, rate, count in ops[:20]:
        flag = "⚠" if rate <= 0 else "✓"
        lines.append(f"{flag} `{op}` ${cost:.4f} rate={rate} qty={count}")
    await update.effective_message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)


async def on_startup(app: Application) -> None:
    fivesim = FiveSim(FIVESIM_API_TOKEN)
    app.bot_data["fivesim"] = fivesim
    await app.bot.set_my_commands(
        [
            BotCommand("buy", f"Comprar {PRODUCT} {COUNTRY} (max ${MAX_PRICE:.0f})"),
            BotCommand("status", "Ver estado del pedido / SMS"),
            BotCommand("ban", "Banear número si no llega SMS"),
            BotCommand("balance", "Ver saldo 5sim"),
            BotCommand("stock", "Ver operadores/stock"),
            BotCommand("help", "Ayuda"),
        ]
    )
    try:
        profile = await fivesim.profile()
        log.info(
            "5sim OK balance=%s max_price=%s min_rate=%s",
            profile.get("balance"),
            MAX_PRICE,
            MIN_RATE,
        )
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
    app.add_handler(CommandHandler("stock", cmd_stock))
    app.add_handler(CommandHandler("buy", cmd_buy))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("ban", cmd_ban))
    log.info(
        "Starting bot country=%s product=%s max_price=%s min_rate=%s",
        COUNTRY,
        PRODUCT,
        MAX_PRICE,
        MIN_RATE,
    )
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
