from app.fps import FpsGovernor


def test_starts_at_three_and_is_ok():
    governor = FpsGovernor()
    assert governor.target_fps == 3.0
    assert governor.status == "ok"


def test_slow_frames_reduce_the_target_fps():
    governor = FpsGovernor()
    for _ in range(10):
        governor.observe(1.0)  # far above the budget at 3 fps
    assert governor.target_fps == 2.0
    assert governor.status == "degraded"


def test_fps_never_goes_below_the_minimum():
    governor = FpsGovernor()
    for _ in range(200):
        governor.observe(5.0)
    assert governor.target_fps == governor.min_fps == 1.0


def test_fast_frames_can_restore_the_target():
    governor = FpsGovernor(target_fps=1.0)
    for _ in range(60):
        governor.observe(0.01)
    assert governor.target_fps == 2.0
    for _ in range(60):
        governor.observe(0.01)
    assert governor.target_fps == 3.0


def test_occasional_slow_frames_do_not_change_the_target():
    governor = FpsGovernor()
    for _ in range(9):
        governor.observe(1.0)
    governor.observe(0.1)
    assert governor.target_fps == 3.0
    assert governor.status == "ok"
