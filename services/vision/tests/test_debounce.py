from app.debounce import TableDebouncer


def make(
    seated_confirm_s: float = 20.0,
    empty_confirm_s: float = 60.0,
    gap_tolerance_s: float = 5.0,
) -> TableDebouncer:
    return TableDebouncer(
        seated_confirm_s=seated_confirm_s,
        empty_confirm_s=empty_confirm_s,
        gap_tolerance_s=gap_tolerance_s,
    )


def test_starts_empty():
    assert make().state == "empty"


def test_walk_by_does_not_trigger():
    debouncer = make()
    for second in range(15):
        debouncer.update(1, float(second))
    assert debouncer.state == "empty"


def test_sitting_for_the_window_becomes_occupied_exactly_at_the_deadline():
    debouncer = make()
    assert debouncer.update(1, 0.0) == "empty"
    assert debouncer.update(1, 19.9) == "empty"
    assert debouncer.update(1, 20.0) == "occupied"


def test_short_gap_is_tolerated_while_confirming():
    debouncer = make()
    debouncer.update(1, 0.0)
    debouncer.update(1, 10.0)
    debouncer.update(0, 11.0)   # 3s gap starts
    debouncer.update(1, 13.0)   # person back, gap <= 5s
    assert debouncer.update(1, 20.0) == "occupied"


def test_gap_longer_than_five_seconds_restarts_the_clock():
    debouncer = make()
    debouncer.update(1, 0.0)
    debouncer.update(1, 4.0)
    debouncer.update(0, 5.0)
    debouncer.update(0, 10.1)   # gap > 5s, presence clock resets
    debouncer.update(1, 10.2)
    assert debouncer.update(1, 25.0) == "empty"
    assert debouncer.update(1, 30.2) == "occupied"


def test_empty_after_empty_confirm_window():
    debouncer = make()
    debouncer.update(1, 0.0)
    assert debouncer.update(1, 20.0) == "occupied"
    debouncer.update(0, 40.0)
    assert debouncer.update(0, 99.9) == "occupied"
    assert debouncer.update(0, 100.0) == "empty"


def test_a_single_detection_restarts_the_empty_window():
    debouncer = make()
    debouncer.update(1, 0.0)
    debouncer.update(1, 20.0)
    debouncer.update(0, 40.0)
    debouncer.update(0, 70.0)
    debouncer.update(1, 71.0)   # somebody briefly detected
    debouncer.update(0, 72.0)
    assert debouncer.update(0, 120.0) == "occupied"
    assert debouncer.update(0, 132.0) == "empty"


def test_two_people_still_occupies_once():
    debouncer = make()
    debouncer.update(3, 0.0)
    assert debouncer.update(2, 20.0) == "occupied"


def test_custom_windows():
    debouncer = make(seated_confirm_s=5.0, empty_confirm_s=5.0)
    assert debouncer.update(1, 0.0) == "empty"
    assert debouncer.update(1, 5.0) == "occupied"
    debouncer.update(0, 6.0)
    assert debouncer.update(0, 11.0) == "empty"


def test_occupancy_stays_put_when_results_are_uncertain():
    debouncer = make(empty_confirm_s=5.0)
    debouncer.update(1, 0.0)
    debouncer.update(1, 20.0)
    for second in range(21, 25):
        debouncer.update(0, float(second))
    # 4 seconds of absence is shorter than the empty window; still occupied.
    assert debouncer.state == "occupied"
