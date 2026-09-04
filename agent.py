import os
import sqlite3
import asyncio
import csv
import io
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
import edge_tts

load_dotenv()

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
DB_PATH = os.path.join(DATA_DIR, "crm.db")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

# Telephony Credentials (Twilio Production/Trial Configuration)
TELEPHONY_CONFIG = {
    "provider": "Twilio",
    "account_sid": os.getenv("TWILIO_ACCOUNT_SID"),
    "api_key_sid": os.getenv("TWILIO_API_KEY_SID"),
    "api_key_secret": os.getenv("TWILIO_API_KEY_SECRET"),
    "from_phone": os.getenv("TWILIO_PHONE_NUMBER")
}

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'Pending',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS call_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            provider_name TEXT NOT NULL,
            model_used TEXT NOT NULL,
            transcript TEXT NOT NULL,
            audio_url TEXT NOT NULL,
            call_mode TEXT DEFAULT 'Simulated',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

PROVIDER_POOL = [
    {
        "id": 0,
        "name": "Groq",
        "api_key": os.getenv("GROQ_API_KEY"),
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.3-70b-versatile",
        "latency": "Fast (~0.4s)",
        "status": "Operational"
    },
    {
        "id": 1,
        "name": "Google Gemini",
        "api_key": os.getenv("GOOGLE_GEMINI_API_KEY"),
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "model": "gemini-3.7-flash",
        "latency": "Ultra-Fast (~0.3s)",
        "status": "Operational"
    },
    {
        "id": 2,
        "name": "OpenRouter",
        "api_key": os.getenv("OPENROUTER_API_KEY"),
        "base_url": "https://openrouter.ai/api/v1",
        "model": "deepseek/deepseek-chat",
        "latency": "Medium (~0.9s)",
        "status": "Operational"
    },
    {
        "id": 3,
        "name": "OpenAI / ChatGPT",
        "api_key": os.getenv("OPENAI_API_KEY"),
        "base_url": None,
        "model": "gpt-4o-mini",
        "latency": "Standard (~0.6s)",
        "status": "Operational"
    }
]

class ProviderManager:
    def __init__(self, providers):
        self.providers = providers
        self.active_index = 0

    def get_active(self):
        return self.providers[self.active_index]

    def set_active(self, provider_id: int):
        if 0 <= provider_id < len(self.providers):
            self.active_index = provider_id
            return self.get_active()
        raise ValueError("Invalid Provider ID")

pm = ProviderManager(PROVIDER_POOL)
COLD_CALLING_PROMPT = "You are an autonomous AI SDR calling leads for a SaaS product. Keep your pitch brief, professional, and friendly. Ask for a 15-minute product demonstration."

async def text_to_speech(text: str, output_file: str):
    communicate = edge_tts.Communicate(text, "en-US-ChristopherNeural")
    await communicate.save(output_file)

# --- ROUTES ---

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    index_path = os.path.join(BASE_DIR, "index.html")
    if not os.path.exists(index_path):
        return HTMLResponse(content="<h1>index.html not found!</h1>", status_code=404)
    with open(index_path, "r", encoding="utf-8") as f:
        return f.read()

class LeadCreate(BaseModel):
    name: str
    phone: str
    notes: str = ""

class LeadUpdate(BaseModel):
    status: str
    notes: str = ""

class CallRequest(BaseModel):
    phone: str
    live_telephony: bool = False

class ProviderSelect(BaseModel):
    provider_id: int

@app.get("/api/stats")
def get_stats():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM leads")
    total_leads = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM leads WHERE status != 'Pending'")
    contacted_leads = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM call_logs")
    total_calls = cursor.fetchone()[0]
    conn.close()
    return {
        "total_leads": total_leads,
        "contacted_leads": contacted_leads,
        "total_calls": total_calls,
        "active_provider": pm.get_active()["name"]
    }

@app.get("/api/providers")
def get_providers():
    return {
        "active_id": pm.active_index,
        "providers": [
            {
                "id": p["id"],
                "name": p["name"],
                "model": p["model"],
                "base_url": p["base_url"] or "https://api.openai.com/v1",
                "latency": p["latency"],
                "status": p["status"],
                "key_masked": p["api_key"][:8] + "..." + p["api_key"][-4:]
            }
            for p in pm.providers
        ]
    }

@app.post("/api/providers/select")
def select_provider(req: ProviderSelect):
    p = pm.set_active(req.provider_id)
    return {"status": "success", "active": p["name"], "model": p["model"]}

@app.get("/api/leads/export")
def export_leads():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, status, notes, created_at FROM leads")
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Name", "Phone", "Status", "Notes", "Created At"])
    writer.writerows(rows)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"}
    )

@app.post("/api/leads/import")
async def import_leads(file: UploadFile = File(...)):
    contents = await file.read()
    decoded = contents.decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    imported_count = 0
    for row in reader:
        name = row.get("Name") or row.get("name")
        phone = row.get("Phone") or row.get("phone")
        notes = row.get("Notes") or row.get("notes") or ""
        if name and phone:
            try:
                cursor.execute("INSERT INTO leads (name, phone, notes) VALUES (?, ?, ?)", (name, phone, notes))
                imported_count += 1
            except sqlite3.IntegrityError:
                continue
    conn.commit()
    conn.close()
    return {"status": "success", "imported": imported_count}

@app.get("/api/leads")
def get_leads(search: str = ""):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    if search:
        cursor.execute("SELECT id, name, phone, status, notes, created_at FROM leads WHERE name LIKE ? OR phone LIKE ?", (f"%{search}%", f"%{search}%"))
    else:
        cursor.execute("SELECT id, name, phone, status, notes, created_at FROM leads ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "phone": r[2], "status": r[3], "notes": r[4], "created_at": r[5]} for r in rows]

@app.post("/api/leads")
def add_lead(lead: LeadCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO leads (name, phone, notes) VALUES (?, ?, ?)", (lead.name, lead.phone, lead.notes))
        conn.commit()
        return {"status": "success"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Phone number already exists")
    finally:
        conn.close()

@app.put("/api/leads/{lead_id}")
def update_lead(lead_id: int, lead: LeadUpdate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE leads SET status = ?, notes = ? WHERE id = ?", (lead.status, lead.notes, lead_id))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.post("/api/call")
async def trigger_call(req: CallRequest):
    provider = pm.get_active()
    client_kwargs = {"api_key": provider["api_key"]}
    if provider["base_url"]:
        client_kwargs["base_url"] = provider["base_url"]

    client = OpenAI(**client_kwargs)
    response = client.chat.completions.create(
        model=provider["model"],
        max_tokens=120,
        messages=[
            {"role": "system", "content": COLD_CALLING_PROMPT},
            {"role": "user", "content": "Hello! Who is this and why are you calling?"}
        ]
    )

    ai_reply = response.choices[0].message.content
    audio_filename = f"call_{req.phone.replace('+', '')}_{int(datetime.now().timestamp())}.mp3"
    audio_path = os.path.join(AUDIO_DIR, audio_filename)
    await text_to_speech(ai_reply, audio_path)

    audio_url = f"/audio/{audio_filename}"
    call_mode = "Twilio Live Call" if req.live_telephony else "Simulated Browser Call"

    # Execute Twilio Outbound Call
    if req.live_telephony:
        try:
            from twilio.rest import Client
            twilio_client = Client(
                TELEPHONY_CONFIG["api_key_sid"],
                TELEPHONY_CONFIG["api_key_secret"],
                account_sid=TELEPHONY_CONFIG["account_sid"]
            )
            twilio_client.calls.create(
                twiml=f'<Response><Say>{ai_reply}</Say></Response>',
                to=req.phone,
                from_=TELEPHONY_CONFIG["from_phone"]
            )
        except Exception as e:
            call_mode += f" (Twilio Error: {str(e)})"

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO call_logs (phone, provider_name, model_used, transcript, audio_url, call_mode) VALUES (?, ?, ?, ?, ?, ?)",
        (req.phone, provider["name"], provider["model"], ai_reply, audio_url, call_mode)
    )
    cursor.execute("UPDATE leads SET status = 'Contacted' WHERE phone = ?", (req.phone,))
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "provider": provider["name"],
        "model": provider["model"],
        "ai_reply": ai_reply,
        "audio_url": audio_url,
        "call_mode": call_mode
    }

@app.get("/api/logs")
def get_call_logs():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, phone, provider_name, model_used, transcript, audio_url, call_mode, timestamp FROM call_logs ORDER BY id DESC LIMIT 10")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "phone": r[1], "provider": r[2], "model": r[3], "transcript": r[4], "audio_url": r[5], "call_mode": r[6], "timestamp": r[7]} for r in rows]

@app.get("/audio/{filename}")
def get_audio(filename: str):
    file_path = os.path.join(AUDIO_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="audio/mpeg")
    raise HTTPException(status_code=404, detail="Audio file not found")