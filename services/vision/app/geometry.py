from __future__ import annotations

from .models import PersonBox

Point = tuple[float, float]
Polygon = tuple[tuple[float, float], ...]


def _on_segment(point: Point, a: Point, b: Point, epsilon: float = 1e-9) -> bool:
    px, py = point
    ax, ay = a
    bx, by = b
    cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
    if abs(cross) > epsilon:
        return False
    return min(ax, bx) - epsilon <= px <= max(ax, bx) + epsilon and min(ay, by) - epsilon <= py <= max(ay, by) + epsilon


def point_in_polygon(x: float, y: float, polygon: Polygon) -> bool:
    if len(polygon) < 3:
        return False

    for index in range(len(polygon)):
        if _on_segment((x, y), polygon[index], polygon[(index + 1) % len(polygon)]):
            return True

    inside = False
    previous = polygon[-1]
    for current in polygon:
        x1, y1 = previous
        x2, y2 = current
        if (y1 > y) != (y2 > y):
            intersect_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersect_x:
                inside = not inside
        previous = current
    return inside


def count_in_polygon(
    boxes: list[PersonBox],
    polygon: Polygon,
    frame_width: int,
    frame_height: int,
) -> tuple[int, float]:
    if frame_width <= 0 or frame_height <= 0:
        return 0, 0.0
    count = 0
    confidence = 0.0
    for box in boxes:
        fx, fy = box.foot_point
        if point_in_polygon(fx / frame_width, fy / frame_height, polygon):
            count += 1
            confidence = max(confidence, box.confidence)
    return count, confidence
