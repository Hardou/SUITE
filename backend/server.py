# server.py — BlankDigi Suite API (FastAPI) — production-friendly (env-based)
# Notes:
# - ما فيه حتى secret hardcoded
# - كيقرا env بأسماء مختلفة (JWT_SECRET_KEY أو SECRET_KEY… / MYSQL_* أو DB_*)
# - init_db كيتدار ف startup وب retry باش الكونتينر ما يطيحش
# - OAuth routes اختيارية (كتخدم إلا عبّيتي GOOGLE/GITHUB env)

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.responses import RedirectResponse, FileResponse
from starlette.background import BackgroundTask
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import mysql.connector
from mysql.connector import Error as MySQLError
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import uuid
import os
import time
import httpx
import base64
import re
import tempfile

from google import genai
from google.genai import types


# ----------------------------
# ENV helpers
# ----------------------------
def _env(*names: str, default: str = "") -> str:
    for n in names:
        v = os.getenv(n)
        if v is not None and str(v).strip() != "":
            return v
    return default


def _env_int(*names: str, default: int = 0) -> int:
    v = _env(*names, default=str(default))
    try:
        return int(v)
    except ValueError:
        return default


def _env_bool(*names: str, default: bool = False) -> bool:
    v = _env(*names, default=str(default)).strip().lower()
    return v in ("1", "true", "yes", "y", "on")


# ----------------------------
# Configuration (ENV only)
# ----------------------------
APP_ENV = _env("APP_ENV", "ENVIRONMENT", default="production").strip().lower()
SECRET_KEY = _env("JWT_SECRET_KEY", "SECRET_KEY", default="")
if not SECRET_KEY:
    if APP_ENV in ("development", "dev", "local"):
        SECRET_KEY = os.urandom(32).hex()
    else:
        raise RuntimeError("JWT_SECRET_KEY (or SECRET_KEY) is required outside local development")
if len(SECRET_KEY) < 32:
    raise RuntimeError("JWT secret must be at least 32 characters")

ALGORITHM = _env("JWT_ALGORITHM", "ALGORITHM", default="HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = _env_int("ACCESS_TOKEN_EXPIRE_MINUTES", default=60)

# Gemini / Veo: server-side only. Never expose GEMINI_API_KEY to the frontend bundle.
GEMINI_API_KEY = _env("GEMINI_API_KEY", default="")
GEMINI_TEXT_MODEL = _env("GEMINI_TEXT_MODEL", default="gemini-3-flash-preview")
GEMINI_THINKING_MODEL = _env("GEMINI_THINKING_MODEL", default="gemini-3-pro-preview")
GEMINI_IMAGE_MODEL = _env("GEMINI_IMAGE_MODEL", default="gemini-3-pro-image-preview")
GEMINI_IMAGE_EDIT_MODEL = _env("GEMINI_IMAGE_EDIT_MODEL", default="gemini-2.5-flash-image")
GEMINI_VIDEO_MODEL = _env("GEMINI_VIDEO_MODEL", default="veo-3.1-fast-generate-preview")
AI_ALLOWED_EMAILS_RAW = _env("AI_ALLOWED_EMAILS", default="")
AI_ALLOWED_EMAILS = {email.strip().lower() for email in AI_ALLOWED_EMAILS_RAW.split(",") if email.strip()}

# OAuth (optional)
GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID", default="")
GOOGLE_CLIENT_SECRET = _env("GOOGLE_CLIENT_SECRET", default="")
GITHUB_CLIENT_ID = _env("GITHUB_CLIENT_ID", default="")
GITHUB_CLIENT_SECRET = _env("GITHUB_CLIENT_SECRET", default="")

# URLs
FRONTEND_URL = _env("FRONTEND_URL", "APP_URL", default="https://blankdigi.com/suite").rstrip("/")
# API base (for OAuth callback URLs). Default assumes nginx proxy: /suite/api
API_BASE_URL = _env("API_BASE_URL", default=f"{FRONTEND_URL}/api").rstrip("/")

# CORS
CORS_ORIGINS_RAW = _env("CORS_ORIGINS", default=f"{FRONTEND_URL}")
CORS_ORIGINS: List[str] = [o.strip() for o in CORS_ORIGINS_RAW.split(",") if o.strip()]

# Email verification requirement
REQUIRE_EMAIL_VERIFICATION = _env_bool("REQUIRE_EMAIL_VERIFICATION", default=False)

# MySQL / DB
DB_HOST = _env("MYSQL_HOST", "DB_HOST", default="127.0.0.1")
DB_PORT = _env_int("MYSQL_PORT", "DB_PORT", default=3306)
DB_USER = _env("MYSQL_USER", "DB_USER", default="root")
DB_PASSWORD = _env("MYSQL_PASSWORD", "DB_PASSWORD", default="")
DB_NAME = _env("MYSQL_DATABASE", "DB_NAME", default="blankdigi")


# ----------------------------
# App setup
# ----------------------------
app = FastAPI(title="BlankDigi Suite API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


# ----------------------------
# Models
# ----------------------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    is_verified: bool


class Token(BaseModel):
    access_token: str
    token_type: str


class GenericResponse(BaseModel):
    message: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class AiTextRequest(BaseModel):
    prompt: str
    use_thinking: bool = False
    use_search: bool = False
    system_instruction: Optional[str] = None


class AiImageRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "1:1"


class AiEditImageRequest(BaseModel):
    base64_image: str
    prompt: str


class AiVideoRequest(BaseModel):
    base64_image: str
    prompt: str
    aspect_ratio: str = "16:9"


# ----------------------------
# DB utils
# ----------------------------
def get_db_connection():
    try:
        return mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            autocommit=False,
        )
    except MySQLError as err:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {err}")


def init_db_once():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            full_name VARCHAR(255),
            reset_token VARCHAR(255) NULL,
            reset_token_expires DATETIME NULL,
            is_verified BOOLEAN DEFAULT FALSE,
            verification_token VARCHAR(255) NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    cur.close()
    conn.close()


@app.on_event("startup")
def startup_init_db():
    # retry a few times so container doesn't crash if DB is slow
    last_err = None
    for _ in range(10):
        try:
            init_db_once()
            return
        except Exception as e:
            last_err = e
            time.sleep(2)

    # If DB still down, keep API alive but endpoints needing DB will fail.
    print(f"[WARN] DB init failed after retries: {last_err}")


# ----------------------------
# Auth utils
# ----------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject_email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": subject_email, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise cred_exc
    except JWTError:
        raise cred_exc

    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user:
        raise cred_exc
    return user


def get_ai_user(current_user: dict = Depends(get_current_user)) -> dict:
    email = str(current_user.get("email") or "").strip().lower()
    if APP_ENV in ("development", "dev", "local") and not AI_ALLOWED_EMAILS:
        return current_user
    if not AI_ALLOWED_EMAILS:
        raise HTTPException(status_code=503, detail="AI access control is not configured")
    if email not in AI_ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="AI access is not allowed for this account")
    return current_user


def _gemini_client():
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="AI service is not configured")
    return genai.Client(api_key=GEMINI_API_KEY)


def _decode_data_url(data_url: str) -> tuple[bytes, str]:
    match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", data_url, flags=re.DOTALL)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid image data URL")
    mime_type, payload = match.group(1), match.group(2)
    try:
        return base64.b64decode(payload, validate=True), mime_type
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")


def _part_to_data_url(part) -> Optional[str]:
    inline = getattr(part, "inline_data", None)
    if inline is None or getattr(inline, "data", None) is None:
        return None
    raw = inline.data
    encoded = raw if isinstance(raw, str) else base64.b64encode(bytes(raw)).decode("ascii")
    mime = getattr(inline, "mime_type", None) or "image/png"
    return f"data:{mime};base64,{encoded}"


def get_or_create_social_user(email: str, full_name: str) -> dict:
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    cur.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    if user:
        cur.close()
        conn.close()
        return user

    random_password = str(uuid.uuid4())
    hashed_password = get_password_hash(random_password)

    cur.execute(
        "INSERT INTO users (email, hashed_password, full_name, is_verified) VALUES (%s, %s, %s, %s)",
        (email, hashed_password, full_name, True),
    )
    conn.commit()

    cur.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return user


# ----------------------------
# Basic endpoints
# ----------------------------
@app.get("/health")
def health():
    return {"status": "ok", "service": "suite-api"}


@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM users WHERE email = %s", (form_data.username,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if REQUIRE_EMAIL_VERIFICATION and not bool(user.get("is_verified")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email not verified.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(subject_email=user["email"])
    return {"access_token": token, "token_type": "bearer"}


@app.post("/register", response_model=GenericResponse)
async def register(user: UserCreate):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    cur.execute("SELECT id FROM users WHERE email = %s", (user.email,))
    if cur.fetchone():
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = get_password_hash(user.password)
    verification_token = str(uuid.uuid4()) if REQUIRE_EMAIL_VERIFICATION else None
    is_verified = False if REQUIRE_EMAIL_VERIFICATION else True

    cur.execute(
        "INSERT INTO users (email, hashed_password, full_name, is_verified, verification_token) VALUES (%s, %s, %s, %s, %s)",
        (user.email, hashed_password, user.full_name, is_verified, verification_token),
    )
    conn.commit()
    cur.close()
    conn.close()

    # In production, send the verification token via a mailer (SMTP/n8n).
    if REQUIRE_EMAIL_VERIFICATION and verification_token:
        print(f"[VERIFY] verification requested for {user.email}")

    msg = "Registration successful."
    if REQUIRE_EMAIL_VERIFICATION:
        msg += " Please verify your email."
    return {"message": msg}


@app.get("/verify-email")
async def verify_email(token: str):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    cur.execute("SELECT * FROM users WHERE verification_token = %s", (token,))
    user = cur.fetchone()
    if not user:
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid verification token")

    cur.execute(
        "UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = %s",
        (user["id"],),
    )
    conn.commit()
    cur.close()
    conn.close()

    return RedirectResponse(f"{FRONTEND_URL}?verified=true")


@app.get("/users/me", response_model=UserOut)
async def read_users_me(current_user: dict = Depends(get_ai_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "full_name": current_user.get("full_name"),
        "is_verified": bool(current_user.get("is_verified")),
    }


@app.post("/forgot-password", response_model=GenericResponse)
async def forgot_password(request: PasswordResetRequest):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM users WHERE email = %s", (request.email,))
    user = cur.fetchone()

    if user:
        token = str(uuid.uuid4())
        expires = datetime.utcnow() + timedelta(minutes=15)
        cur.execute(
            "UPDATE users SET reset_token = %s, reset_token_expires = %s WHERE id = %s",
            (token, expires, user["id"]),
        )
        conn.commit()

        # In production, send the reset token via a mailer (SMTP/n8n). Never log the token.
        print(f"[RESET] password reset requested for {request.email}")

    cur.close()
    conn.close()
    return {"message": "If email exists, a reset token has been sent."}


@app.post("/reset-password", response_model=GenericResponse)
async def reset_password(data: PasswordResetConfirm):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM users WHERE reset_token = %s", (data.token,))
    user = cur.fetchone()

    if not user:
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid token")

    expires = user.get("reset_token_expires")
    if not expires or expires < datetime.utcnow():
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Token expired")

    hashed_password = get_password_hash(data.new_password)
    cur.execute(
        "UPDATE users SET hashed_password = %s, reset_token = NULL, reset_token_expires = NULL WHERE id = %s",
        (hashed_password, user["id"]),
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Password reset successfully"}


# ----------------------------
# Server-side AI proxy
# ----------------------------
@app.post("/ai/text")
def ai_text(data: AiTextRequest, current_user: dict = Depends(get_ai_user)):
    client = _gemini_client()
    config_kwargs = {}

    if data.system_instruction:
        config_kwargs["system_instruction"] = data.system_instruction
    if data.use_thinking:
        config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=32768)
    if data.use_search:
        config_kwargs["tools"] = [types.Tool(google_search=types.GoogleSearch())]

    model = GEMINI_THINKING_MODEL if data.use_thinking else GEMINI_TEXT_MODEL
    response = client.models.generate_content(
        model=model,
        contents=data.prompt,
        config=types.GenerateContentConfig(**config_kwargs),
    )

    grounding_urls = []
    candidates = getattr(response, "candidates", None) or []
    if candidates:
        metadata = getattr(candidates[0], "grounding_metadata", None)
        chunks = getattr(metadata, "grounding_chunks", None) or []
        for chunk in chunks:
            web = getattr(chunk, "web", None)
            uri = getattr(web, "uri", None) if web else None
            title = getattr(web, "title", None) if web else None
            if uri and not any(item["uri"] == uri for item in grounding_urls):
                grounding_urls.append({"uri": uri, "title": title or uri})

    return {"text": getattr(response, "text", "") or "", "groundingUrls": grounding_urls}


@app.post("/ai/image")
def ai_image(data: AiImageRequest, current_user: dict = Depends(get_ai_user)):
    if data.aspect_ratio not in ("1:1", "3:4", "4:3", "9:16", "16:9"):
        raise HTTPException(status_code=400, detail="Unsupported aspect ratio")

    client = _gemini_client()
    response = client.models.generate_content(
        model=GEMINI_IMAGE_MODEL,
        contents=data.prompt,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(aspect_ratio=data.aspect_ratio, image_size="1K"),
        ),
    )

    for part in getattr(response, "parts", None) or []:
        data_url = _part_to_data_url(part)
        if data_url:
            return {"data_url": data_url}
    raise HTTPException(status_code=502, detail="AI image generation returned no image")


@app.post("/ai/edit-image")
def ai_edit_image(data: AiEditImageRequest, current_user: dict = Depends(get_ai_user)):
    image_bytes, mime_type = _decode_data_url(data.base64_image)
    client = _gemini_client()
    response = client.models.generate_content(
        model=GEMINI_IMAGE_EDIT_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            data.prompt,
        ],
        config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
    )

    for part in getattr(response, "parts", None) or []:
        data_url = _part_to_data_url(part)
        if data_url:
            return {"data_url": data_url}
    raise HTTPException(status_code=502, detail="AI image editing returned no image")


@app.post("/ai/video")
def ai_video(data: AiVideoRequest, current_user: dict = Depends(get_ai_user)):
    if data.aspect_ratio not in ("16:9", "9:16"):
        raise HTTPException(status_code=400, detail="Unsupported video aspect ratio")

    image_bytes, mime_type = _decode_data_url(data.base64_image)
    client = _gemini_client()
    source = types.GenerateVideosSource(
        prompt=data.prompt or "Animate this image",
        image=types.Image(image_bytes=image_bytes, mime_type=mime_type),
    )
    operation = client.models.generate_videos(
        model=GEMINI_VIDEO_MODEL,
        source=source,
        config=types.GenerateVideosConfig(
            number_of_videos=1,
            resolution="720p",
            aspect_ratio=data.aspect_ratio,
        ),
    )

    deadline = time.time() + 300
    while not operation.done:
        if time.time() >= deadline:
            raise HTTPException(status_code=504, detail="Video generation timed out")
        time.sleep(10)
        operation = client.operations.get(operation)

    generated = getattr(getattr(operation, "response", None), "generated_videos", None) or []
    if not generated or not getattr(generated[0], "video", None):
        raise HTTPException(status_code=502, detail="AI video generation returned no video")

    fd, output_path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    try:
        client.files.download(file=generated[0].video, destination=output_path)
    except Exception:
        try:
            os.unlink(output_path)
        except OSError:
            pass
        raise

    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename="generated.mp4",
        background=BackgroundTask(lambda: os.path.exists(output_path) and os.unlink(output_path)),
    )


# ----------------------------
# OAuth (optional)
# ----------------------------
@app.get("/login/google")
async def login_google():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")
    redirect_uri = f"{API_BASE_URL}/auth/google/callback"
    scope = "openid%20email%20profile"
    return RedirectResponse(
        f"https://accounts.google.com/o/oauth2/v2/auth?client_id={GOOGLE_CLIENT_ID}"
        f"&response_type=code&scope={scope}&redirect_uri={redirect_uri}"
    )


@app.get("/login/github")
async def login_github():
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=400, detail="GitHub OAuth not configured")
    # GitHub callback should be configured in GitHub OAuth app settings to:
    # {API_BASE_URL}/auth/github/callback
    return RedirectResponse(
        f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&scope=user:email"
    )


@app.get("/auth/google/callback")
async def auth_google_callback(code: str):
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="Google OAuth not configured")

    redirect_uri = f"{API_BASE_URL}/auth/google/callback"
    token_url = "https://oauth2.googleapis.com/token"

    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.post(
            token_url,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        token_json = token_res.json()
        access_token = token_json.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Google token exchange failed")

        info_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        info = info_res.json()
        email = info.get("email")
        name = info.get("name") or ""
        if not email:
            raise HTTPException(status_code=400, detail="Google did not return email")

    user = get_or_create_social_user(email, name)
    jwt_token = create_access_token(subject_email=user["email"])
    return RedirectResponse(f"{FRONTEND_URL}?token={jwt_token}")


@app.get("/auth/github/callback")
async def auth_github_callback(code: str):
    if not (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="GitHub OAuth not configured")

    token_url = "https://github.com/login/oauth/access_token"
    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.post(
            token_url,
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
        )
        token_json = token_res.json()
        access_token = token_json.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="GitHub token exchange failed")

        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        u = user_res.json()
        email = u.get("email")
        name = u.get("name") or u.get("login") or ""

        if not email:
            emails_res = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            emails = emails_res.json()
            for e in emails:
                if e.get("primary") and e.get("verified"):
                    email = e.get("email")
                    break

        if not email:
            raise HTTPException(status_code=400, detail="Could not retrieve email from GitHub")

    user = get_or_create_social_user(email, name)
    jwt_token = create_access_token(subject_email=user["email"])
    return RedirectResponse(f"{FRONTEND_URL}?token={jwt_token}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
