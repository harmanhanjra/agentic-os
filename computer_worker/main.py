from __future__ import annotations

import base64
import io
import os
import platform
import secrets
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw

app = FastAPI(title="ScaleOS Computer Worker", version="0.3.0")

TOKEN = os.getenv("SCALEOS_COMPUTER_WORKER_TOKEN", "").strip()
MODE = os.getenv("SCALEOS_COMPUTER_WORKER_MODE", "real").strip().lower()
JPEG_QUALITY = max(35, min(90, int(os.getenv("SCALEOS_COMPUTER_JPEG_QUALITY", "60"))))
MAX_ACTIONS_PER_REQUEST = max(1, min(10, int(os.getenv("SCALEOS_COMPUTER_MAX_BATCH", "3"))))

DANGEROUS = (
    "buy", "purchase", "checkout", "pay", "transfer", "withdraw", "send money",
    "delete", "remove account", "close account", "publish", "post", "send message",
    "submit application", "book now", "password", "passcode", "otp", "security code",
    "cvv", "cvc", "card number", "bank account", "sign in", "log in", "create account",
    "upload", "download"
)


class Policy(BaseModel):
    allowFinancial: bool = False
    allowDestructive: bool = False
    allowExternalCommunication: bool = False
    allowCredentials: bool = False
    allowFileUpload: bool = False


class DesktopAction(BaseModel):
    type: Literal[
        "move", "click", "double_click", "right_click", "drag",
        "scroll", "type", "hotkey", "press", "wait"
    ]
    target: str = Field(min_length=1, max_length=300)
    x: int | None = None
    y: int | None = None
    x2: int | None = None
    y2: int | None = None
    button: Literal["left", "right", "middle"] = "left"
    text: str | None = Field(default=None, max_length=4000)
    keys: list[str] | None = Field(default=None, max_length=6)
    key: str | None = Field(default=None, max_length=40)
    amount: int | None = Field(default=None, ge=-6000, le=6000)
    durationMs: int | None = Field(default=None, ge=0, le=5000)
    ms: int | None = Field(default=None, ge=0, le=10000)


class ActionRequest(BaseModel):
    requestId: str
    frameId: str
    actions: list[DesktopAction] = Field(min_length=1, max_length=MAX_ACTIONS_PER_REQUEST)
    policy: Policy = Policy()


class ActionResult(BaseModel):
    index: int
    type: str
    status: Literal["completed", "blocked", "failed"]
    message: str
    target: str


class WorkerState(BaseModel):
    frameId: str
    capturedAt: float
    width: int
    height: int
    cursorX: int
    cursorY: int
    screenshotDataUrl: str
    activeWindow: str | None = None


class WorkerHealth(BaseModel):
    status: Literal["healthy"]
    mode: str
    platform: str
    screen: bool
    mouse: bool
    keyboard: bool
    capabilities: list[str]


def require_auth(authorization: str | None = Header(default=None)) -> None:
    if not TOKEN:
        if os.getenv("SCALEOS_COMPUTER_ALLOW_NO_AUTH", "false").lower() == "true":
            return
        raise HTTPException(status_code=503, detail="Worker token is not configured.")
    expected = "Bearer " + TOKEN
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")


def is_blocked(action: DesktopAction, policy: Policy) -> str | None:
    text = " ".join([
        action.target,
        action.text or "",
        " ".join(action.keys or []),
        action.key or "",
    ]).lower()
    if any(word in text for word in DANGEROUS):
        if any(word in text for word in ("password", "passcode", "otp", "security code", "cvv", "cvc", "card number", "bank account", "sign in", "log in")) and not policy.allowCredentials:
            return "Credential/account actions require explicit approval."
        if any(word in text for word in ("buy", "purchase", "checkout", "pay", "transfer", "withdraw", "send money", "book now")) and not policy.allowFinancial:
            return "Financial actions require explicit approval."
        if any(word in text for word in ("delete", "remove account", "close account")) and not policy.allowDestructive:
            return "Destructive actions require explicit approval."
        if any(word in text for word in ("publish", "post", "send message", "submit application")) and not policy.allowExternalCommunication:
            return "External communication requires explicit approval."
        if any(word in text for word in ("upload", "download")) and not policy.allowFileUpload:
            return "File transfer requires explicit approval."
    return None


class DesktopBackend:
    def capture(self) -> WorkerState:
        raise NotImplementedError

    def execute(self, action: DesktopAction) -> str:
        raise NotImplementedError


class RealDesktopBackend(DesktopBackend):
    def __init__(self) -> None:
        try:
            import pyautogui  # type: ignore
            import mss  # type: ignore
        except Exception as exc:
            raise RuntimeError(
                "Real desktop mode requires pyautogui and mss. Install computer_worker/requirements.txt."
            ) from exc
        self.pyautogui = pyautogui
        self.mss = mss
        self.pyautogui.FAILSAFE = True
        self.lock = threading.Lock()

    def capture(self) -> WorkerState:
        with self.lock:
            with self.mss.mss() as sct:
                monitor = sct.monitors[0]
                shot = sct.grab(monitor)
                image = Image.frombytes("RGB", shot.size, shot.rgb)
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            x, y = self.pyautogui.position()
            return WorkerState(
                frameId=str(uuid.uuid4()),
                capturedAt=time.time(),
                width=image.width,
                height=image.height,
                cursorX=int(x),
                cursorY=int(y),
                screenshotDataUrl="data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"),
                activeWindow=None,
            )

    def _point(self, action: DesktopAction) -> tuple[int, int]:
        if action.x is None or action.y is None:
            raise ValueError("This action requires x and y coordinates.")
        return action.x, action.y

    def execute(self, action: DesktopAction) -> str:
        p = self.pyautogui
        duration = (action.durationMs or 120) / 1000
        with self.lock:
            if action.type == "move":
                x, y = self._point(action)
                p.moveTo(x, y, duration=duration)
            elif action.type == "click":
                x, y = self._point(action)
                p.click(x=x, y=y, button=action.button)
            elif action.type == "double_click":
                x, y = self._point(action)
                p.doubleClick(x=x, y=y, button=action.button, interval=0.12)
            elif action.type == "right_click":
                x, y = self._point(action)
                p.rightClick(x=x, y=y)
            elif action.type == "drag":
                x, y = self._point(action)
                if action.x2 is None or action.y2 is None:
                    raise ValueError("Drag requires x2 and y2 coordinates.")
                p.moveTo(x, y, duration=0.1)
                p.dragTo(action.x2, action.y2, duration=max(duration, 0.2), button=action.button)
            elif action.type == "scroll":
                p.scroll(int(action.amount or 0))
            elif action.type == "type":
                p.write(action.text or "", interval=0.01)
            elif action.type == "hotkey":
                keys = action.keys or []
                if not keys:
                    raise ValueError("Hotkey requires keys.")
                p.hotkey(*keys)
            elif action.type == "press":
                if not action.key:
                    raise ValueError("Press requires key.")
                p.press(action.key)
            elif action.type == "wait":
                time.sleep((action.ms or 500) / 1000)
            else:
                raise ValueError("Unsupported action type.")
        return "Executed " + action.type + " on " + action.target


@dataclass
class VirtualDesktop:
    text: str = ""
    cursor_x: int = 100
    cursor_y: int = 100
    events: list[str] | None = None

    def __post_init__(self) -> None:
        if self.events is None:
            self.events = []


class VirtualDesktopBackend(DesktopBackend):
    def __init__(self) -> None:
        self.state = VirtualDesktop()
        self.lock = threading.Lock()

    def capture(self) -> WorkerState:
        with self.lock:
            image = Image.new("RGB", (960, 600), "white")
            draw = ImageDraw.Draw(image)
            draw.rectangle((80, 70, 880, 520), outline="black", width=2)
            draw.text((110, 100), "ScaleOS Virtual Desktop", fill="black")
            draw.rectangle((110, 170, 700, 220), outline="black", width=2)
            draw.text((125, 187), self.state.text or "empty text field", fill="black")
            draw.rectangle((110, 270, 300, 320), outline="black", width=2)
            draw.text((155, 287), "Demo Button", fill="black")
            draw.text((110, 380), "Events: " + ", ".join((self.state.events or [])[-6:]), fill="black")
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=70)
            return WorkerState(
                frameId=str(uuid.uuid4()),
                capturedAt=time.time(),
                width=image.width,
                height=image.height,
                cursorX=self.state.cursor_x,
                cursorY=self.state.cursor_y,
                screenshotDataUrl="data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"),
                activeWindow="ScaleOS Virtual Desktop",
            )

    def execute(self, action: DesktopAction) -> str:
        with self.lock:
            if action.x is not None:
                self.state.cursor_x = action.x
            if action.y is not None:
                self.state.cursor_y = action.y
            if action.type == "type":
                self.state.text += action.text or ""
            elif action.type == "hotkey" and set(action.keys or []) >= {"ctrl", "a"}:
                self.state.text = ""
            elif action.type == "wait":
                time.sleep(min((action.ms or 50) / 1000, 0.1))
            self.state.events.append(action.type)
        return "Executed " + action.type + " on " + action.target


backend: DesktopBackend
if MODE == "virtual":
    backend = VirtualDesktopBackend()
else:
    backend = RealDesktopBackend()


@app.get("/health", response_model=WorkerHealth)
def health(_: None = Depends(require_auth)) -> WorkerHealth:
    return WorkerHealth(
        status="healthy",
        mode=MODE,
        platform=platform.system().lower(),
        screen=True,
        mouse=True,
        keyboard=True,
        capabilities=[
            "screenshot", "move", "click", "double_click", "right_click",
            "drag", "scroll", "type", "hotkey", "press", "wait"
        ],
    )


@app.get("/v1/state", response_model=WorkerState)
def state(_: None = Depends(require_auth)) -> WorkerState:
    try:
        return backend.capture()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/v1/actions")
def actions(body: ActionRequest, _: None = Depends(require_auth)) -> dict:
    results: list[ActionResult] = []
    for index, action in enumerate(body.actions):
        blocked = is_blocked(action, body.policy)
        if blocked:
            results.append(ActionResult(
                index=index,
                type=action.type,
                status="blocked",
                message=blocked,
                target=action.target,
            ))
            break
        try:
            message = backend.execute(action)
            results.append(ActionResult(
                index=index,
                type=action.type,
                status="completed",
                message=message,
                target=action.target,
            ))
        except Exception as exc:
            results.append(ActionResult(
                index=index,
                type=action.type,
                status="failed",
                message=str(exc),
                target=action.target,
            ))
            break
    return {
        "requestId": body.requestId,
        "frameId": body.frameId,
        "results": [result.model_dump() for result in results],
    }


@app.get("/")
def root() -> dict:
    return {"name": "ScaleOS Computer Worker", "status": "running", "mode": MODE}
