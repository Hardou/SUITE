from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Union
import mysql.connector
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import uuid
import os
import httpx

# --- CONFIGURATION ---
# CHANGE THESE VALUES
SECRET_KEY = "CHANGE_ME_TO_A_SUPER_SECRET_KEY_IBRA"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# OAuth Config (Replace with real credentials)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "YOUR_GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "YOUR_GOOGLE_CLIENT_SECRET")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "YOUR_GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "YOUR_GITHUB_CLIENT_SECRET")

# Frontend URL for redirects
FRONTEND_URL = "http://localhost:3000"

# Database Config (MySQL)
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "", # Add your MySQL password
    "database": "blankdigi_db" # Ensure this DB exists
}

# --- APP SETUP ---
app = FastAPI(title="BlankDigi Auth API")

# Allow React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- MODELS ---
class UserBase(BaseModel):
    email: str

class UserCreate(UserBase):
    password: str
    full_name: Optional[str] = None

class User(UserBase):
    id: int
    full_name: Optional[str] = None
    is_verified: bool

class Token(BaseModel):
    access_token: str
    token_type: str

class GenericResponse(BaseModel):
    message: str

class PasswordResetRequest(BaseModel):
    email: str

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

# --- DATABASE UTILS ---
def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Database connection failed: {err}")
        raise HTTPException(status_code=500, detail="Database connection failed")

def init_db():
    """Create users table if not exists and ensure columns match"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Create table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                full_name VARCHAR(255),
                reset_token VARCHAR(255) NULL,
                reset_token_expires DATETIME NULL,
                is_verified BOOLEAN DEFAULT FALSE,
                verification_token VARCHAR(255) NULL
            )
        """)
        
        # Check if new columns exist (simple migration for existing tables)
        cursor.execute("DESCRIBE users")
        columns = [column[0] for column in cursor.fetchall()]
        
        if 'reset_token' not in columns:
            print("Migrating DB: Adding reset_token...")
            cursor.execute("ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL")
            
        if 'reset_token_expires' not in columns:
            print("Migrating DB: Adding reset_token_expires...")
            cursor.execute("ALTER TABLE users ADD COLUMN reset_token_expires DATETIME NULL")

        if 'is_verified' not in columns:
            print("Migrating DB: Adding is_verified...")
            cursor.execute("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE")
            
        if 'verification_token' not in columns:
            print("Migrating DB: Adding verification_token...")
            cursor.execute("ALTER TABLE users ADD COLUMN verification_token VARCHAR(255) NULL")
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Init Error: {e}")

# Initialize on startup
init_db()

# --- AUTH UTILS ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cursor.fetchone()
    conn.close()
    
    if user is None:
        raise credentials_exception
    return user

def get_or_create_social_user(email: str, full_name: str):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cursor.fetchone()
    
    if user:
        conn.close()
        return user
    
    # Create new user with random password. Social users are auto-verified.
    random_password = str(uuid.uuid4())
    hashed_password = get_password_hash(random_password)
    
    cursor.execute(
        "INSERT INTO users (email, hashed_password, full_name, is_verified) VALUES (%s, %s, %s, %s)",
        (email, hashed_password, full_name, True)
    )
    conn.commit()
    
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    new_user = cursor.fetchone()
    conn.close()
    return new_user

# --- ENDPOINTS ---

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (form_data.username,))
    user = cursor.fetchone()
    conn.close()

    if not user or not verify_password(form_data.password, user['hashed_password']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user['is_verified']:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email not verified. Please check your inbox for the verification link.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user['email']})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/register", response_model=GenericResponse)
async def register(user: UserCreate):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Check if exists
    cursor.execute("SELECT * FROM users WHERE email = %s", (user.email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Insert with verification token and is_verified=False
    hashed_password = get_password_hash(user.password)
    verification_token = str(uuid.uuid4())
    
    cursor.execute(
        "INSERT INTO users (email, hashed_password, full_name, is_verified, verification_token) VALUES (%s, %s, %s, %s, %s)",
        (user.email, hashed_password, user.full_name, False, verification_token)
    )
    conn.commit()
    conn.close()
    
    # MOCK EMAIL SENDING
    print(f"---------------------------------------------------")
    print(f"VERIFICATION EMAIL FOR: {user.email}")
    print(f"LINK: http://localhost:8000/verify-email?token={verification_token}")
    print(f"---------------------------------------------------")
    
    return {"message": "Registration successful. Please check your email to verify your account."}

@app.get("/verify-email")
async def verify_email(token: str):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("SELECT * FROM users WHERE verification_token = %s", (token,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid verification token")
        
    cursor.execute(
        "UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = %s",
        (user['id'],)
    )
    conn.commit()
    conn.close()
    
    return RedirectResponse(f"{FRONTEND_URL}?verified=true")

@app.get("/users/me", response_model=User)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user['id'],
        "email": current_user['email'],
        "full_name": current_user['full_name'],
        "is_verified": bool(current_user['is_verified'])
    }

@app.post("/forgot-password")
async def forgot_password(request: PasswordResetRequest):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (request.email,))
    user = cursor.fetchone()
    
    if user:
        # Generate Token
        token = str(uuid.uuid4())
        expires = datetime.utcnow() + timedelta(minutes=15)
        
        cursor.execute(
            "UPDATE users SET reset_token = %s, reset_token_expires = %s WHERE id = %s",
            (token, expires, user['id'])
        )
        conn.commit()
        
        # MOCK EMAIL SENDING
        print(f"---------------------------------------------------")
        print(f"PASSWORD RESET EMAIL FOR: {request.email}")
        print(f"TOKEN: {token}")
        print(f"---------------------------------------------------")
    
    conn.close()
    return {"message": "If email exists, a reset token has been sent."}

@app.post("/reset-password")
async def reset_password(data: PasswordResetConfirm):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("SELECT * FROM users WHERE reset_token = %s", (data.token,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid token")
        
    if user['reset_token_expires'] < datetime.utcnow():
        conn.close()
        raise HTTPException(status_code=400, detail="Token expired")
        
    hashed_password = get_password_hash(data.new_password)
    
    cursor.execute(
        "UPDATE users SET hashed_password = %s, reset_token = NULL, reset_token_expires = NULL WHERE id = %s",
        (hashed_password, user['id'])
    )
    conn.commit()
    conn.close()
    
    return {"message": "Password reset successfully"}

# --- OAUTH ROUTES ---

@app.get("/login/google")
async def login_google():
    return RedirectResponse(
        f"https://accounts.google.com/o/oauth2/v2/auth?client_id={GOOGLE_CLIENT_ID}&response_type=code&scope=openid%20email%20profile&redirect_uri=http://localhost:8000/auth/google/callback"
    )

@app.get("/login/github")
async def login_github():
    return RedirectResponse(
        f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&scope=user:email"
    )

@app.get("/auth/google/callback")
async def auth_google_callback(code: str):
    token_url = "https://oauth2.googleapis.com/token"
    async with httpx.AsyncClient() as client:
        # Exchange code for token
        token_response = await client.post(token_url, data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": "http://localhost:8000/auth/google/callback"
        })
        token_json = token_response.json()
        access_token = token_json.get("access_token")
        
        # Get User Info
        user_info_response = await client.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={
            "Authorization": f"Bearer {access_token}"
        })
        user_info = user_info_response.json()
        
        email = user_info.get("email")
        name = user_info.get("name")
        
        user = get_or_create_social_user(email, name)
        
        jwt_token = create_access_token(data={"sub": user['email']})
        return RedirectResponse(f"{FRONTEND_URL}?token={jwt_token}")

@app.get("/auth/github/callback")
async def auth_github_callback(code: str):
    token_url = "https://github.com/login/oauth/access_token"
    async with httpx.AsyncClient() as client:
        # Exchange code for token
        token_response = await client.post(token_url, headers={"Accept": "application/json"}, data={
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "code": code
        })
        token_json = token_response.json()
        access_token = token_json.get("access_token")
        
        # Get User Info
        user_response = await client.get("https://api.github.com/user", headers={
            "Authorization": f"Bearer {access_token}"
        })
        user_data = user_response.json()
        
        # Get Email (handle private emails)
        email = user_data.get("email")
        if not email:
            email_response = await client.get("https://api.github.com/user/emails", headers={
                "Authorization": f"Bearer {access_token}"
            })
            emails = email_response.json()
            for e in emails:
                if e.get("primary") and e.get("verified"):
                    email = e.get("email")
                    break
        
        name = user_data.get("name") or user_data.get("login")
        
        if not email:
            raise HTTPException(status_code=400, detail="Could not retrieve email from GitHub")

        user = get_or_create_social_user(email, name)
        
        jwt_token = create_access_token(data={"sub": user['email']})
        return RedirectResponse(f"{FRONTEND_URL}?token={jwt_token}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
