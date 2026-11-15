from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse

from .config import Environment
from .service import VisionService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("dinesense.vision")


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


app = FastAPI(title="DineSense Vision", version="0.2.0", lifespan=lifespan)


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(app.state.service.health())


@app.get("/snapshot/{camera_id}.jpg")
def snapshot(camera_id: str) -> Response:
    frame = app.state.service.snapshot(camera_id)
    if frame is None:
        return Response(status_code=404, content="no frame for this camera yet")
    return Response(
        content=frame[0],
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )
