import unittest
from unittest.mock import patch

from fastapi.responses import JSONResponse

from api.index import build_quote_result, should_try_playwright_fallback


class TestBuildQuoteResult(unittest.TestCase):
    def test_rejects_login_like_html(self) -> None:
        html = "<html><body>login password 登入</body></html>"
        result = build_quote_result(html, "https://quote.saiens.tw/test")
        self.assertIsInstance(result, JSONResponse)
        assert isinstance(result, JSONResponse)
        self.assertEqual(result.status_code, 401)

    def test_rejects_html_without_quote_data(self) -> None:
        html = "<html><body><p>loading</p></body></html>"
        result = build_quote_result(html, "https://quote.saiens.tw/test")
        self.assertIsInstance(result, JSONResponse)
        assert isinstance(result, JSONResponse)
        self.assertEqual(result.status_code, 422)


class TestPlaywrightFallback(unittest.TestCase):
    @patch("api.index.playwright_available", return_value=False)
    def test_skips_when_playwright_unavailable(self, _mock_available: object) -> None:
        html = "<html><body>loading</body></html>"
        self.assertFalse(should_try_playwright_fallback(html, "https://quote.saiens.tw/test"))

    @patch("api.index.playwright_fallback_enabled", return_value=True)
    @patch("api.index.playwright_available", return_value=True)
    def test_requests_fallback_for_dynamic_page(self, _mock_available: object, _mock_enabled: object) -> None:
        html = "<html><body>loading</body></html>"
        self.assertTrue(should_try_playwright_fallback(html, "https://quote.saiens.tw/test"))

    @patch("api.index.playwright_fallback_enabled", return_value=True)
    @patch("api.index.playwright_available", return_value=True)
    def test_skips_login_like_page(self, _mock_available: object, _mock_enabled: object) -> None:
        html = "<html><body>login password 登入</body></html>"
        self.assertFalse(should_try_playwright_fallback(html, "https://quote.saiens.tw/test"))


if __name__ == "__main__":
    unittest.main()
