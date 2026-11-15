from __future__ import annotations

from dataclasses import dataclass

from .models import TableState


@dataclass
class TableDebouncer:
    """Turns noisy per-frame person counts into a stable occupied/empty state.

    occupied: a person is present for seated_confirm_s, tolerating gaps of at most
    gap_tolerance_s. empty: nobody for empty_confirm_s. When unsure, stay occupied.
    """

    seated_confirm_s: float
    empty_confirm_s: float
    gap_tolerance_s: float = 5.0
    state: TableState = "empty"
    present_since: float | None = None
    absent_since: float | None = None
    last_present_at: float | None = None

    def update(self, person_count: int, now: float) -> TableState:
        if person_count > 0:
            self.last_present_at = now
            self.absent_since = None
            if self.present_since is None:
                self.present_since = now
            if self.state == "empty" and now - self.present_since >= self.seated_confirm_s:
                self.state = "occupied"
            return self.state

        if self.absent_since is None:
            self.absent_since = now
        if (
            self.last_present_at is not None
            and now - self.last_present_at > self.gap_tolerance_s
        ):
            self.present_since = None

        if self.state == "occupied" and now - self.absent_since >= self.empty_confirm_s:
            self.state = "empty"
            self.present_since = None

        return self.state
