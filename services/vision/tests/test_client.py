import threading
import time

from app.client import EventSender, HeartbeatPublisher, PermanentPostError


def test_event_sender_retries_until_the_app_returns():
    calls = []
    delivered = threading.Event()

    def post(event):
        calls.append(dict(event))
        if len(calls) < 3:
            raise ConnectionError("app is down")
        delivered.set()

    sender = EventSender(post, retry_base_s=0.01, max_delay_s=0.05)
    sender.start()
    try:
        sender.submit({"event_id": "evt-1", "state": "occupied"})
        assert delivered.wait(2.0)
        assert sender.sent == 1
        assert sender.failed_attempts >= 2
        assert all(call["event_id"] == "evt-1" for call in calls)
    finally:
        sender.stop()


def test_event_sender_drops_permanently_rejected_events():
    called = threading.Event()

    def post(_event):
        called.set()
        raise PermanentPostError("bad request")

    sender = EventSender(post, retry_base_s=0.01)
    sender.start()
    try:
        sender.submit({"event_id": "evt-2"})
        assert called.wait(2.0)
        deadline = time.time() + 1.0
        while sender.dropped == 0 and time.time() < deadline:
            time.sleep(0.01)
        assert sender.dropped == 1
        assert sender.sent == 0
    finally:
        sender.stop()


def test_event_sender_bounds_the_queue():
    sender = EventSender(lambda _event: None, queue_size=2)
    sender.submit({"event_id": "a"})
    sender.submit({"event_id": "b"})
    sender.submit({"event_id": "c"})
    assert sender.stats()["queued"] == 2
    assert sender.stats()["dropped"] == 1


def test_heartbeat_survives_failures_and_keeps_sending():
    sent = []
    failed_once = threading.Event()

    def send(camera_id, status, fps):
        sent.append((camera_id, status, fps))
        if not failed_once.is_set():
            failed_once.set()
            raise ConnectionError("down")

    publisher = HeartbeatPublisher(send, interval_s=0.05)
    publisher.update("cam-1", "ok", 3.0)
    publisher.start()
    try:
        deadline = time.time() + 2.0
        while len(sent) < 2 and time.time() < deadline:
            time.sleep(0.01)
        assert len(sent) >= 2
        assert sent[-1][0] == "cam-1"
        assert sent[-1][1] == "ok"
    finally:
        publisher.stop()
