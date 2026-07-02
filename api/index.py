import math
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup, Tag
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from api.playwright_fetch import (
    fetch_html_playwright,
    playwright_available,
    playwright_fallback_enabled,
)
from api.rate_limit import SlidingWindowRateLimiter

app = FastAPI()

ALLOWED_HOST = "quote.saiens.tw"
GATE_EMAIL = "gate@ivy.app"
GATE_LOGIN_LIMIT = 10
GATE_LOGIN_WINDOW_SEC = 60

_gate_login_limiter = SlidingWindowRateLimiter()
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


class FetchQuoteRequest(BaseModel):
    url: str


class GateLoginRequest(BaseModel):
    password: str


class QuoteHttpError(Exception):
    def __init__(self, status_code: int):
        self.status_code = status_code
        super().__init__(f"HTTP {status_code}")


def _load_local_env() -> None:
    """Load .env.local for local uvicorn (Vite already reads it for the frontend)."""
    path = Path(__file__).resolve().parent.parent / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_local_env()


def _env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def err(status: int, error_type: str, message: str, detail: str = "") -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"ok": False, "errorType": error_type, "message": message, "detail": detail},
    )


# ── Routes ───────────────────────────────────────────────────────────────────


@app.get("/api/health")
async def health():
    return {"ok": True, "message": "server is running"}


@app.post("/api/gate-login")
async def gate_login(body: GateLoginRequest, request: Request):
    password = body.password
    if not password:
        return err(400, "INVALID_INPUT", "請輸入密碼")

    ip = _client_ip(request)
    allowed, retry_after = _gate_login_limiter.check(
        f"gate-login:{ip}", GATE_LOGIN_LIMIT, GATE_LOGIN_WINDOW_SEC
    )
    if not allowed:
        return err(
            429,
            "RATE_LIMITED",
            f"登入嘗試過於頻繁，請 {retry_after} 秒後再試",
            f"同一 IP 每 {GATE_LOGIN_WINDOW_SEC} 秒最多 {GATE_LOGIN_LIMIT} 次",
        )

    supabase_url = _env("SUPABASE_URL", "VITE_SUPABASE_URL")
    anon_key = _env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    if not supabase_url or not anon_key:
        return err(
            503,
            "CONFIG_ERROR",
            "登入服務未設定，請聯絡管理員",
            "缺少 SUPABASE_URL / SUPABASE_ANON_KEY",
        )

    token_url = f"{supabase_url.rstrip('/')}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
    }
    payload = {"email": GATE_EMAIL, "password": password}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(token_url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        print(f"[gate-login] upstream error: {exc}")
        return err(502, "AUTH_UPSTREAM", "登入服務暫時無法連線，請稍後再試")

    if response.status_code == 200:
        data = response.json()
        return JSONResponse(
            {
                "ok": True,
                "access_token": data.get("access_token", ""),
                "refresh_token": data.get("refresh_token", ""),
                "expires_in": data.get("expires_in"),
            }
        )

    if response.status_code in (400, 401, 422):
        return err(401, "INVALID_CREDENTIALS", "密碼錯誤")

    print(f"[gate-login] unexpected status {response.status_code}: {response.text[:200]}")
    return err(502, "AUTH_UPSTREAM", "登入失敗，請稍後再試")


@app.post("/api/fetch-quote")
async def fetch_quote(body: FetchQuoteRequest):
    quote_url = body.url.strip()
    print(f"[fetch-quote] url: {quote_url}")

    try:
        parsed = urlparse(quote_url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError
    except Exception:
        return err(400, "INVALID_URL", "請提供有效的報價單網址", "網址格式無法解析。")

    if parsed.hostname != ALLOWED_HOST:
        return err(
            400,
            "HOST_NOT_ALLOWED",
            "只允許抓取 quote.saiens.tw 報價單網址",
            "為避免本服務變成任意 proxy，目標網域被限制為 quote.saiens.tw。",
        )

    if parsed.scheme not in ("http", "https"):
        return err(400, "INVALID_PROTOCOL", "報價單網址協定不支援", "只允許 http 或 https 網址。")

    try:
        html = await fetch_quote_html_httpx(quote_url)
        print(f"[fetch-quote] httpx length: {len(html)}")
    except httpx.TimeoutException:
        return err(504, "TIMEOUT", "抓取逾時", "連線 quote.saiens.tw 超時，請稍後再試。")
    except QuoteHttpError as exc:
        return err(
            exc.status_code,
            "QUOTE_HTTP_ERROR",
            "quote 網站回傳錯誤",
            f"quote.saiens.tw 回傳 HTTP {exc.status_code}，可能網址、access_token 或權限有問題。",
        )
    except Exception as exc:
        return err(500, "FETCH_ERROR", "抓取失敗", str(exc))

    result = build_quote_result(html, quote_url)
    if isinstance(result, JSONResponse) and should_try_playwright_fallback(html, quote_url):
        try:
            print("[fetch-quote] trying playwright fallback")
            playwright_html = await fetch_html_playwright(quote_url)
            print(f"[fetch-quote] playwright length: {len(playwright_html)}")
            retry = build_quote_result(playwright_html, quote_url)
            if not isinstance(retry, JSONResponse):
                return retry
        except Exception as exc:
            print(f"[fetch-quote] playwright fallback failed: {exc}")

    return result


async def fetch_quote_html_httpx(quote_url: str) -> str:
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        response = await client.get(quote_url, headers=BROWSER_HEADERS)

    print(f"[fetch-quote] status: {response.status_code}, length: {len(response.text)}")

    if not response.is_success:
        raise QuoteHttpError(response.status_code)

    return response.text


def should_try_playwright_fallback(html: str, quote_url: str) -> bool:
    if not playwright_fallback_enabled() or not playwright_available():
        return False

    diagnosis = diagnose_html(html)
    if diagnosis["login_like"]:
        return False

    try:
        quote = parse_quote_html(html, quote_url)
    except ValueError as exc:
        return "金額" in str(exc) or "動態" in str(exc)
    except Exception:
        return False

    return (
        not diagnosis["has_quote_keywords"]
        and not quote.get("taxExcludedAmount")
        and not quote.get("taxIncludedAmount")
    )


def build_quote_result(html: str, quote_url: str) -> dict[str, Any] | JSONResponse:
    diagnosis = diagnose_html(html)

    if diagnosis["login_like"]:
        return err(
            401,
            "AUTH_REQUIRED",
            "報價單頁面需要登入或權限不足",
            "目前後端抓到的不是報價單內容，可能 access_token 無效或 quote.saiens.tw 需要登入 cookie。",
        )

    try:
        quote = parse_quote_html(html, quote_url)
    except Exception as exc:
        msg = str(exc)
        if "金額" in msg or "動態載入" in msg:
            return err(422, "NO_QUOTE_DATA", msg, "")
        return err(500, "PARSE_ERROR", "解析失敗", msg)

    if (
        not diagnosis["has_quote_keywords"]
        and not quote.get("taxExcludedAmount")
        and not quote.get("taxIncludedAmount")
    ):
        return err(
            422,
            "NO_QUOTE_DATA",
            "抓到 HTML，但沒有報價單資料",
            "可能報價單內容是 JavaScript 動態載入。",
        )

    return {"ok": True, "quote": quote}


# ── HTML helpers ─────────────────────────────────────────────────────────────


def normalize_text(value: str) -> str:
    text = str(value or "")
    text = text.replace(" ", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def diagnose_html(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    body = soup.body
    text = normalize_text(body.get_text(separator=" ") if body else html)
    return {
        "text": text,
        "login_like": bool(
            re.search(r"(login|sign in|password|登入|無權限|access denied)", text, re.I)
        ),
        "has_quote_keywords": bool(re.search(r"(未連稅金額|總計|發表於)", text)),
        "too_short": len(html) < 800,
    }


def parse_quote_html(html: str, quote_url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["script", "style", "noscript", "svg"]):
        tag.decompose()

    body = soup.body
    text = normalize_text(body.get_text(separator="\n") if body else html)

    order_no = extract_order_no(text, quote_url)
    customer_name = extract_customer_name(text)
    sales_rep = extract_sales_rep(text)
    customer_type = infer_customer_type(f"{customer_name}\n{text}")
    default_commission_rate = 5 if customer_type == "personal" else 4

    amount_debug: dict[str, Any] = {
        "taxExcludedLabel": "",
        "taxExcludedRaw": "",
        "taxIncludedLabel": "",
        "taxIncludedRaw": "",
    }
    amount_inferred = False

    excluded = find_amount_by_label_groups(
        text, [["未連稅金額", "未連稅 金額"], ["未稅金額"]]
    ) or empty_amount()
    included = find_amount_by_label_groups(
        text, [["總計"], ["含稅總價", "總價"]]
    ) or empty_amount()

    tax_excluded = excluded["amount"]
    tax_included = included["amount"]
    amount_debug["taxExcludedLabel"] = excluded["label"]
    amount_debug["taxExcludedRaw"] = excluded["raw"]
    amount_debug["taxIncludedLabel"] = included["label"]
    amount_debug["taxIncludedRaw"] = included["raw"]

    if not tax_excluded and not tax_included:
        raise ValueError("抓不到金額，可能該頁面是 JavaScript 動態載入")

    if not tax_excluded and tax_included:
        tax_excluded = round(tax_included / 1.05)
        amount_debug["taxExcludedLabel"] = "由總計反推"
        amount_debug["taxExcludedRaw"] = str(tax_excluded)
        amount_inferred = True

    if not tax_included and tax_excluded:
        tax_included = round(tax_excluded * 1.05)
        amount_debug["taxIncludedLabel"] = "由未連稅金額反推"
        amount_debug["taxIncludedRaw"] = str(tax_included)
        amount_inferred = True

    sig = extract_signature_info(html, text, order_no)

    return {
        "quoteUrl": quote_url,
        "orderNo": order_no,
        "customerName": customer_name,
        "salesRep": sales_rep,
        "customerType": customer_type,
        "taxExcludedAmount": tax_excluded,
        "taxIncludedAmount": tax_included,
        "defaultCommissionRate": default_commission_rate,
        "amountInferred": amount_inferred,
        "amountDebug": amount_debug,
        "signedAtText": sig["signed_at_text"],
        "signedMonth": sig["signed_month"],
        "signedQuarterKey": sig["signed_quarter_key"],
        "signatureDebug": sig["signature_debug"],
    }


# ── Extraction helpers ────────────────────────────────────────────────────────


def extract_order_no(text: str, quote_url: str) -> str:
    m = re.search(r"/orders/(\d+)", quote_url)
    from_url = m.group(1) if m else ""

    # Saiens pages show a business case id (e.g. S11812) under 案件編號, separate
    # from the numeric /orders/{id} in the URL. Prefer explicit labels — the old
    # generic regex often matched phone numbers or partial digits from S-codes.
    for pat in (
        r"案件編號\s*[：:]\s*\n?\s*([A-Za-z0-9_-]+)",
        r"報價單編號\s*[：:]\s*\n?\s*([A-Za-z0-9_-]+)",
        r"訂單編號\s*[：:]\s*\n?\s*([A-Za-z0-9_-]+)",
    ):
        m_label = re.search(pat, text)
        if m_label:
            return m_label.group(1).strip()

    lines = [ln.strip() for ln in text.split("\n")]
    for i, line in enumerate(lines):
        for name in ("案件編號", "報價單編號", "訂單編號"):
            m_inline = re.match(rf"^{re.escape(name)}\s*[：:]\s*(.+)$", line)
            if m_inline and m_inline.group(1).strip():
                return m_inline.group(1).strip()
            if re.match(rf"^{re.escape(name)}\s*[：:]?\s*$", line):
                for j in range(i + 1, min(i + 4, len(lines))):
                    candidate = lines[j].strip()
                    if candidate and candidate not in {"/"}:
                        return candidate

    return from_url


def extract_sales_rep(text: str) -> str:
    for pat in (
        r"案件業務\s*[：:]\s*\n?\s*([^\n\r]+)",
    ):
        m = re.search(pat, text)
        if m:
            return clean_labeled_value(m.group(1))

    lines = [ln.strip() for ln in text.split("\n")]
    for i, line in enumerate(lines):
        m_inline = re.match(r"^案件業務\s*[：:]\s*(.+)$", line)
        if m_inline and m_inline.group(1).strip():
            return clean_labeled_value(m_inline.group(1))
        if re.match(r"^案件業務\s*[：:]?\s*$", line):
            for j in range(i + 1, min(i + 4, len(lines))):
                candidate = lines[j].strip()
                if candidate and not re.match(r"^(聯絡|報價|案件|電話|/)$", candidate):
                    return clean_labeled_value(candidate)
    return ""


def clean_labeled_value(value: str) -> str:
    return re.sub(r"\s{2,}.*", "", str(value or "")).strip()


def extract_customer_name(text: str) -> str:
    m = re.search(r"(?:客戶名稱|客戶資訊|客戶|買受人|業主|公司名稱)[：:\s]*([^\n\r]+)", text)
    if m:
        return clean_customer_name(m.group(1))
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    company_re = r"(有限公司|股份有限公司|企業|工程|設計|室內裝修|事務所|工作室|商行|個人業主|自宅)"
    for line in lines:
        if re.search(company_re, line):
            return clean_customer_name(line)
    return ""


def clean_customer_name(value: str) -> str:
    value = re.sub(r"^(客戶名稱|客戶資訊|客戶|買受人|業主|公司名稱)[：:\s]*", "", str(value or ""))
    value = re.sub(r"\s{2,}.*", "", value)
    return value.strip()


def infer_customer_type(value: str) -> str:
    text = str(value or "")
    personal = bool(re.search(r"(個人業主|個人|業主|自宅)", text))
    company = bool(re.search(r"(公司|有限公司|股份有限公司|企業|工程|設計|室內裝修|事務所|工作室|行|商行)", text))
    if personal and not company:
        return "personal"
    if company:
        return "company"
    if personal:
        return "personal"
    return "unknown"


def empty_amount() -> dict:
    return {"label": "", "raw": "", "amount": 0}


def find_amount_by_label_groups(text: str, label_groups: list) -> Optional[dict]:
    for group in label_groups:
        for label in group:
            result = find_amount_after_label(text, label)
            if result["amount"] > 0:
                return result
    return None


def find_amount_after_label(text: str, label: str) -> dict:
    escaped = r"\s*".join(re.escape(part) for part in label.split())
    label_re = re.compile(escaped, re.I)
    money_re = re.compile(
        r"(?:NT\$|TWD|\$)?\s*[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?"
        r"|(?:NT\$|TWD|\$)?\s*[-+]?\d{4,}(?:\.\d+)?",
        re.I,
    )
    for m in label_re.finditer(text):
        nearby = text[m.end() : m.end() + 120]
        for am in money_re.finditer(nearby):
            raw = am.group()
            amount = parse_amount(raw)
            if amount > 0:
                return {"label": label, "raw": raw.strip(), "amount": amount}
    return empty_amount()


def parse_amount(raw: str) -> int:
    cleaned = re.sub(r"NT\$|TWD|\$", "", str(raw or ""), flags=re.I)
    cleaned = cleaned.replace(",", "")
    cleaned = re.sub(r"[^\d.\-]", "", cleaned).strip()
    try:
        value = float(cleaned)
        return round(value) if math.isfinite(value) else 0
    except (ValueError, TypeError):
        return 0


# ── Signature extraction ──────────────────────────────────────────────────────


def find_signed_date_near_signature(text: str) -> dict:
    """
    Primary extraction: scan full-page text for a date near a signature event.
    Structure-agnostic — works regardless of HTML class names or page layout.

    In Odoo the chatter shows:
        發表於 2024年 3月 15日 上午 10:30
        訂單由 張先生 簽名。
    The date always appears within ~500 chars before the signature text.
    """
    # Anchors ordered strongest → weakest
    sig_re = re.compile(
        r"訂單由[\s\S]{0,120}?簽名"  # "Order signed by [name]" — strongest
        r"|已簽(?:名|署)"
        r"|客戶簽名"
        r"|簽名",
        re.I,
    )
    date_patterns = [
        # Chinese format: 2024年3月15日 (+ optional time)
        re.compile(
            r"(?P<year>\d{4})\s*年\s*(?P<month>\d{1,2})\s*月\s*(?P<day>\d{1,2})\s*日"
            r"(?:[^\n]{0,80}(?P<meridiem>上午|下午)?\s*(?P<hour>\d{1,2}):(?P<minute>\d{2}))?"
        ),
        # Slash format: 2024/03/15 10:30
        re.compile(
            r"(?P<year>\d{4})/(?P<month>\d{1,2})/(?P<day>\d{1,2})"
            r"(?:\s+(?P<hour>\d{1,2}):(?P<minute>\d{2}))?"
        ),
    ]

    for sig_m in sig_re.finditer(text):
        sig_text = re.sub(r"\s+", " ", sig_m.group()).strip()
        # Date appears BEFORE the signature text in Odoo — look in prior 500 chars
        before = text[max(0, sig_m.start() - 500) : sig_m.start()]

        for dpat in date_patterns:
            all_matches = list(dpat.finditer(before))
            if not all_matches:
                continue
            dm = all_matches[-1]  # last (closest) date before the signature
            g = dm.groupdict()
            year = int(g["year"])
            month = int(g["month"])
            day = int(g.get("day") or 1)
            if not (2020 <= year <= 2040 and 1 <= month <= 12):
                continue

            meridiem = g.get("meridiem") or ""
            hour = int(g.get("hour") or 0)
            minute = int(g.get("minute") or 0)
            if meridiem == "下午" and 0 < hour < 12:
                hour += 12
            if meridiem == "上午" and hour == 12:
                hour = 0

            date_text = re.sub(r"\s+", " ", dm.group()).strip()
            try:
                ts = int(datetime(year, month, day, hour, minute).timestamp() * 1000)
            except ValueError:
                ts = 0

            return {
                "signed_month": f"{year}-{month:02d}",
                "signed_at_text": f"{date_text} {sig_text}".strip(),
                "timestamp": ts,
                "matched_by": "direct-text-search",
            }

    return {"signed_month": "", "signed_at_text": "", "timestamp": 0, "matched_by": ""}


def extract_signature_info(html: str, text: str, order_no: str) -> dict:
    # ── Pass 1: structure-agnostic full-text search (most reliable) ──────────
    direct = find_signed_date_near_signature(text)
    if direct["signed_month"]:
        return {
            "signed_at_text": direct["signed_at_text"],
            "signed_month": direct["signed_month"],
            "signed_quarter_key": get_fiscal_quarter(direct["signed_month"])["key"],
            "signature_debug": {
                "matchedBy": direct["matched_by"],
                "matchedMessageText": direct["signed_at_text"],
                "matchedAttachmentText": "",
                "candidates": [],
            },
        }

    # ── Pass 2: DOM-based search — Odoo message container fallback ───────────
    soup = BeautifulSoup(html, "html.parser")
    containers = collect_message_containers(soup)
    candidates = (
        [message_candidate_from_element(el, idx, order_no) for idx, el in enumerate(containers)]
        if containers
        else fallback_message_candidates(text, order_no)
    )

    # Prefer: has_signature + signed_month (PDF no longer required)
    viable = [c for c in candidates if c["has_signature"] and c["signed_month"]]
    if not viable:
        # Fallback: any candidate that found a date
        viable = [c for c in candidates if c["signed_month"]]
    viable.sort(key=lambda c: (c["score"], c["timestamp"]), reverse=True)
    selected = viable[0] if viable else None

    if not selected:
        return {
            "signed_at_text": "",
            "signed_month": "",
            "signed_quarter_key": "",
            "signature_debug": {
                "matchedBy": "",
                "matchedMessageText": "",
                "matchedAttachmentText": "",
                "candidates": [public_candidate(c) for c in candidates[:12]],
            },
        }

    return {
        "signed_at_text": selected["signed_at_text"],
        "signed_month": selected["signed_month"],
        "signed_quarter_key": get_fiscal_quarter(selected["signed_month"])["key"],
        "signature_debug": {
            "matchedBy": selected["matched_by"],
            "matchedMessageText": selected["message_text"],
            "matchedAttachmentText": selected["attachment_text"],
            "candidates": [public_candidate(c) for c in candidates[:12]],
        },
    }


def collect_message_containers(soup: BeautifulSoup) -> list:
    seen: set[str] = set()
    containers: list[Tag] = []

    exact_classes = ["o_Message", "o-mail-Message", "o_Chatter", "o_thread_message"]
    for cls in exact_classes:
        for el in soup.find_all(class_=cls):
            key = el.get_text(separator=" ").strip()[:220]
            if key and key not in seen:
                seen.add(key)
                containers.append(el)

    pattern = re.compile(r"Message|message|chatter|mail")
    for el in soup.find_all(class_=pattern):
        key = el.get_text(separator=" ").strip()[:220]
        if key and key not in seen:
            seen.add(key)
            containers.append(el)

    return containers


def message_candidate_from_element(el: Tag, index: int, order_no: str) -> dict:
    message_text = normalize_text(el.get_text(separator=" "))[:2000]
    hrefs = [str(a.get("href", "")) for a in el.find_all("a", href=True)]
    attachment_els = el.find_all(class_=re.compile(r"attachment|Attachment"))
    attachment_text = normalize_text(" ".join(tag.get_text() for tag in attachment_els + el.find_all("a")))
    return build_signature_candidate(
        index=index,
        message_text=message_text,
        attachment_text=attachment_text,
        hrefs=hrefs,
        order_no=order_no,
        source="dom-message",
    )


def fallback_message_candidates(text: str, order_no: str) -> list:
    chunks = re.split(r"(?=發表於\s*\d{4}\s*年)|(?=\d{4}[/\-]\d{1,2}[/\-]\d{1,2})", normalize_text(text))
    return [
        build_signature_candidate(
            index=idx,
            message_text=chunk[:2000],
            attachment_text=chunk,
            hrefs=[],
            order_no=order_no,
            source="body-text",
        )
        for idx, chunk in enumerate(c.strip() for c in chunks if c.strip())
    ]


def build_signature_candidate(*, index, message_text, attachment_text, hrefs, order_no, source) -> dict:
    combined = f"{attachment_text}\n{chr(10).join(hrefs)}"
    has_signature = bool(re.search(r"簽名", message_text))
    has_pdf = bool(re.search(r"\.pdf\b", combined, re.I))
    has_order_no = bool(order_no and re.search(re.escape(order_no), combined, re.I))
    strong_signature = bool(re.search(r"訂單由[\s\S]{0,80}簽名", message_text))
    date = extract_posted_date(message_text)

    score = 0
    if has_signature:
        score += 15
    if has_pdf:
        score += 10  # present = bonus, absent = not penalised
    if has_order_no:
        score += 40
    if strong_signature:
        score += 25  # "訂單由...簽名" is the definitive event
    if date["signed_month"]:
        score += 10

    return {
        "index": index,
        "source": source,
        "message_text": message_text,
        "attachment_text": combined.strip()[:1000],
        "hrefs": hrefs,
        "has_signature": has_signature,
        "has_pdf": has_pdf,
        "has_order_no": has_order_no,
        "strong_signature": strong_signature,
        "signed_at_text": date["signed_at_text"],
        "signed_month": date["signed_month"],
        "timestamp": date["timestamp"],
        "score": score,
        "matched_by": (
            "signature+pdf+orderNo" if has_order_no else ("signature+pdf" if has_pdf else "candidate")
        ),
    }


def extract_posted_date(value: str) -> dict:
    text = normalize_text(value)
    patterns = [
        re.compile(
            r"(?:發表於\s*)?(?P<year>\d{4})\s*年\s*(?P<month>\d{1,2})\s*月\s*(?P<day>\d{1,2})\s*日"
            r"(?:\s*(?P<meridiem>上午|下午))?\s*(?P<hour>\d{1,2})?:?(?P<minute>\d{2})?"
        ),
        re.compile(
            r"(?P<year>\d{4})/(?P<month>\d{1,2})/(?P<day>\d{1,2})\s+(?P<hour>\d{1,2}):(?P<minute>\d{2})"
        ),
        re.compile(
            r"(?P<year>\d{4})-(?P<month>\d{1,2})-(?P<day>\d{1,2})\s+(?P<hour>\d{1,2}):(?P<minute>\d{2})"
        ),
    ]

    for pattern in patterns:
        m = pattern.search(text)
        if not m:
            continue
        g = m.groupdict()
        year, month, day = int(g["year"]), int(g["month"]), int(g["day"])
        meridiem = g.get("meridiem") or ""
        hour = int(g.get("hour") or 0)
        minute = int(g.get("minute") or 0)

        if meridiem == "下午" and 0 < hour < 12:
            hour += 12
        if meridiem == "上午" and hour == 12:
            hour = 0

        signed_month = f"{year}-{month:02d}"
        date_text = re.sub(r"\s+", " ", m.group()).strip()
        try:
            ts = int(datetime(year, month, day, hour, minute).timestamp() * 1000)
        except ValueError:
            ts = 0

        return {
            "signed_at_text": build_signed_at_text(text, date_text),
            "signed_month": signed_month,
            "timestamp": ts,
        }

    return {"signed_at_text": "", "signed_month": "", "timestamp": 0}


def build_signed_at_text(full_text: str, date_text: str) -> str:
    m = re.search(r"訂單由[\s\S]{0,80}?簽名", full_text)
    if m:
        cleaned = re.sub(r"\s+", " ", m.group()).strip()
        suffix = f" {cleaned}"
    else:
        suffix = ""
    return f"{date_text}{suffix}".strip()


def public_candidate(c: dict) -> dict:
    return {
        "source": c["source"],
        "score": c["score"],
        "matchedBy": c["matched_by"],
        "signedAtText": c["signed_at_text"],
        "signedMonth": c["signed_month"],
        "hasSignature": c["has_signature"],
        "hasPdf": c["has_pdf"],
        "hasOrderNo": c["has_order_no"],
        "messageText": c["message_text"][:320],
        "attachmentText": c["attachment_text"][:240],
    }


# ── Fiscal quarter ────────────────────────────────────────────────────────────
# mirrors src/shared/fiscalQuarter.ts — keep in sync


def get_fiscal_quarter(month_string: str) -> dict:
    if not re.match(r"^\d{4}-\d{2}$", str(month_string or "")):
        return {"year": 0, "quarter": "", "key": ""}
    year_str, month_str = month_string.split("-")
    raw_year, month = int(year_str), int(month_str)
    year = raw_year
    if month in (2, 3, 4):
        quarter = "Q1"
    elif month in (5, 6, 7):
        quarter = "Q2"
    elif month in (8, 9, 10):
        quarter = "Q3"
    else:
        quarter = "Q4"
        if month == 1:
            year = raw_year - 1
    return {"year": year, "quarter": quarter, "key": f"{year}-{quarter}"}
