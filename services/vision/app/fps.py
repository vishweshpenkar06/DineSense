from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FpsGovernor:
    target_fps: float = 3.0
    min_fps: float = 1.0
    slow_streak: int = 0
    fast_streak: int = 0

    @property
    def status(self) -> str:
        return "ok" if self.target_fps >= 3.0 else "degraded"

    def interval(self) -> float:
        return 1.0 / max(self.target_fps, self.min_fps)

    def observe(self, processing_s: float) -> bool:
        budget = 1.0 / max(self.target_fps, self.min_fps)
        if processing_s > budget * 1.5:
            self.slow_streak += 1
            self.fast_streak = 0
        elif processing_s < budget * 0.5:
            self.fast_streak += 1
            self.slow_streak = 0
        else:
            self.slow_streak = 0
            self.fast_streak = 0

        if self.slow_streak >= 10 and self.target_fps > self.min_fps:
            self.target_fps = max(self.min_fps, self.target_fps - 1.0)
            self.slow_streak = 0
            return True

        if self.fast_streak >= 60 and self.target_fps < 3.0:
            self.target_fps = min(3.0, self.target_fps + 1.0)
            self.fast_streak = 0
            return True

        return False
