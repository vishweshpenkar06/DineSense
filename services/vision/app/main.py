from __future__ import annotations

import hmac
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import cv2
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .config import Environment
from .service import VisionService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("dinesense.vision")


class CameraTestRequest(BaseModel):
    rtsp_url: str


def require_secret(request: Request) -> None:
    secret = os.environ.get("VISION_SHARED_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="Vision secret is not configured")
    header = request.headers.get("authorization", "")
    if not hmac.compare_digest(header, f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


def test_stream(url: str) -> dict[str, object]:
    if not (
        url.startswith(("rtsp://", "rtsps://", "http://", "https://"))
        or url.startswith("/data/")
    ):
        return {"ok": False, "error": "Use an RTSP/HTTP stream or a /data video path"}

    capture = cv2.VideoCapture(url)
    capture.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
    capture.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
    try:
        if not capture.isOpened():
            return {"ok": False, "error": "Could not open the stream"}
        ok, frame = capture.read()
        if not ok or frame is None:
            return {"ok": False, "error": "Stream opened but no frame arrived"}
        height, width = frame.shape[:2]
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        return {
            "ok": True,
            "width": int(width),
            "height": int(height),
            "fps": round(fps, 2) if fps > 0 else None,
        }
    finally:
        capture.release()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    env = Environment.from_env()
    logger.info(
        "starting vision service api=%s demo=%s force_file=%s zones=%s",
        env.api_base_url,
        env.demo,
        env.force_file,
        env.zones_file,
    )
    service = VisionService(env)
    service.start()
    app.state.service = service
    try:
        yield
    finally:
        service.stop()


app = FastAPI(title="DineSense Vision", version="0.3.0", lifespan=lifespan)


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(app.state.service.health())


@app.get("/snapshot/{camera_id}.jpg")
def snapshot(camera_id: str, request: Request) -> Response:
    require_secret(request)
    frame = app.state.service.snapshot(camera_id, "annotated")
    if frame is None:
        return Response(status_code=404, content="no frame for this camera yet")
    return Response(
        content=frame[0],
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/frame/{camera_id}.jpg")
def raw_frame(camera_id: str, request: Request) -> Response:
    require_secret(request)
    frame = app.state.service.snapshot(camera_id, "raw")
    if frame is None:
        return Response(status_code=404, content="no raw frame for this camera yet")
    return Response(
        content=frame[0],
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/test")
def test_camera(payload: CameraTestRequest, request: Request) -> JSONResponse:
    require_secret(request)
    return JSONResponse(test_stream(payload.rtsp_url.strip()))


@app.post("/config/refresh")
def refresh_config(request: Request) -> JSONResponse:
    require_secret(request)
    app.state.service.refresh_config()
    return JSONResponse({"ok": True})


@app.get("/tuning")
def tuning(request: Request, tail: int = 100) -> JSONResponse:
    require_secret(request)
    return JSONResponse(app.state.service.tuning_rows(min(max(tail, 1), 500)))
