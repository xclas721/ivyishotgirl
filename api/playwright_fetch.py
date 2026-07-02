import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=1)


def playwright_fallback_enabled() -> bool:
    return os.getenv("PLAYWRIGHT_FALLBACK", "1").strip().lower() in ("1", "true", "yes")


def playwright_available() -> bool:
    try:
        import playwright  # noqa: F401

        return True
    except ImportError:
        return False


def fetch_html_playwright_sync(url: str, timeout_ms: int = 30000) -> str:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            return page.content()
        finally:
            browser.close()


async def fetch_html_playwright(url: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, fetch_html_playwright_sync, url)
