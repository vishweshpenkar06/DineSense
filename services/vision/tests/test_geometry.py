import pytest

from app.geometry import count_in_polygon, point_in_polygon
from app.models import PersonBox

SQUARE = ((0.1, 0.1), (0.5, 0.1), (0.5, 0.5), (0.1, 0.5))


def box(x1, y1, x2, y2, conf=0.9):
    return PersonBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=conf)


def test_point_inside_and_outside():
    assert point_in_polygon(0.2, 0.2, SQUARE)
    assert not point_in_polygon(0.6, 0.2, SQUARE)
    assert not point_in_polygon(0.2, 0.6, SQUARE)


def test_point_on_edge_and_corner_counts():
    assert point_in_polygon(0.1, 0.3, SQUARE)
    assert point_in_polygon(0.3, 0.1, SQUARE)
    assert point_in_polygon(0.1, 0.1, SQUARE)
    assert point_in_polygon(0.5, 0.5, SQUARE)


def test_triangle():
    triangle = ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0))
    assert point_in_polygon(0.1, 0.1, triangle)
    assert not point_in_polygon(0.9, 0.9, triangle)


def test_degenerate_polygon_is_never_inside():
    assert not point_in_polygon(0.5, 0.5, ())
    assert not point_in_polygon(0.5, 0.5, ((0.0, 0.0), (1.0, 1.0)))


def test_foot_point_is_bottom_centre():
    person = box(10, 20, 30, 100)
    assert person.foot_point == (20.0, 100.0)


def test_count_uses_foot_point_not_bounding_box():
    inside = box(20, 20, 40, 200)          # foot (30, 200) / (100, 400) = (0.3, 0.5)
    outside = box(20, 20, 40, 260)         # foot (30, 260) = (0.3, 0.65) -> below the zone
    assert count_in_polygon([inside], SQUARE, 100, 400) == (1, pytest.approx(0.9))
    assert count_in_polygon([outside], SQUARE, 100, 400) == (0, 0.0)


def test_count_multiple_people_and_confidence():
    people = [box(50, 20, 70, 200, 0.6), box(80, 20, 100, 190, 0.95)]
    count, confidence = count_in_polygon(people, SQUARE, 200, 400)
    assert count == 2
    assert confidence == pytest.approx(0.95)


def test_count_handles_zero_sized_frames():
    assert count_in_polygon([box(1, 1, 2, 2)], SQUARE, 0, 0) == (0, 0.0)
