from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

TableState = Literal["occupied", "empty"]


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


@dataclass(frozen=True)
class TableZone:
    id: str
    label: str
    polygon: tuple[tuple[float, float], ...]
    muted_until: datetime | None = None

    def is_muted(self, now: datetime) -> bool:
        return self.muted_until is not None and self.muted_until > now


@dataclass(frozen=True)
class CameraSpec:
    id: str
    name: str
    rtsp_url: str
    tables: tuple[TableZone, ...]
    video_path: str | None = None

    def signature(self) -> tuple[str, str]:
        return (self.rtsp_url, self.video_path or "")


@dataclass(frozen=True)
class VisionSettings:
    seated_confirm_s: float = 20.0
    empty_confirm_s: float = 60.0
    gap_tolerance_s: float = 5.0
    target_fps: float = 3.0
    min_fps: float = 1.0
    heartbeat_s: float = 10.0
    config_poll_s: float = 60.0
    snapshot_fps: float = 1.0


@dataclass(frozen=True)
class PersonBox:
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float

    @property
    def foot_point(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, self.y2)
