import unittest
import time

from api.rate_limit import SlidingWindowRateLimiter


class TestSlidingWindowRateLimiter(unittest.TestCase):
    def test_allows_requests_under_limit(self) -> None:
        limiter = SlidingWindowRateLimiter()
        for _ in range(3):
            allowed, retry_after = limiter.check('ip-1', limit=3, window_sec=60)
            self.assertTrue(allowed)
            self.assertEqual(retry_after, 0)

    def test_blocks_requests_over_limit(self) -> None:
        limiter = SlidingWindowRateLimiter()
        for _ in range(2):
            limiter.check('ip-2', limit=2, window_sec=60)

        allowed, retry_after = limiter.check('ip-2', limit=2, window_sec=60)
        self.assertFalse(allowed)
        self.assertGreaterEqual(retry_after, 1)

    def test_resets_after_window(self) -> None:
        limiter = SlidingWindowRateLimiter()
        limiter.check('ip-3', limit=1, window_sec=0.05)
        time.sleep(0.06)
        allowed, retry_after = limiter.check('ip-3', limit=1, window_sec=0.05)
        self.assertTrue(allowed)
        self.assertEqual(retry_after, 0)


if __name__ == '__main__':
    unittest.main()
