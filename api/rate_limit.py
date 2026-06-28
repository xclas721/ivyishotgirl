"""In-memory sliding-window rate limiter (best-effort on serverless)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_sec: float) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds). Counts only when allowed."""
        now = time.time()
        cutoff = now - window_sec
        with self._lock:
            hits = [t for t in self._hits[key] if t > cutoff]
            if len(hits) >= limit:
                retry_after = max(1, int(window_sec - (now - hits[0])) + 1)
                return False, retry_after
            hits.append(now)
            self._hits[key] = hits
            return True, 0
