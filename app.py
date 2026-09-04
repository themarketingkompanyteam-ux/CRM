import os
import csv
import io
import sqlite3
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel
from twilio.rest import Client

load_dotenv()

# 1. Initialize FastAPI App first
app = FastAPI(title="AI Voice CRM Engine")

DB_PATH = os.path.join("data", "crm.db")
os.makedirs("data", exist_ok=True)

# Telephony Configuration
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
            phone TEXT UNIQUE NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'New',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("SELECT COUNT(*) FROM leads")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT OR IGNORE INTO leads (name, phone, notes, status) VALUES (?, ?, ?, ?)",
            ("Shahab", "+18027137445", "Primary contact", "New")
        )
    conn.commit()
    conn.close()

init_db()

class LeadCreate(BaseModel):
    name: str
    phone: str
    notes: str = ""

class CallRequest(BaseModel):
    phone: str
    live_telephony: bool = True  # Default to true now that credentials are provided

ACTIVE_PROVIDER_ID = 1
PROVIDERS = [
    {"id": 1, "name": "Groq", "model": "llama-3.3-70b-versatile", "latency": "Fast (~0.4s)"},
    {"id": 2, "name": "Google Gemini", "model": "gemini-3.7-flash", "latency": "Ultra-Fast (~0.3s)"},
    {"id": 3, "name": "OpenRouter", "model": "deepseek/deepseek-chat", "latency": "Medium (~0.9s)"},
    {"id": 4, "name": "OpenAI / ChatGPT", "model": "gpt-4o-mini", "latency": "Standard (~0.6s)"}
]

@app.get("/", response_class=HTMLResponse)
def read_root():
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>index.html not found! Please ensure it is in the same directory.</h1>"

@app.get("/api/stats")
def get_stats():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM leads")
    total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM leads WHERE status = 'Contacted'")
    contacted = cursor.fetchone()[0]
    conn.close()
    
    active_name = next((p["name"] for p in PROVIDERS if p["id"] == ACTIVE_PROVIDER_ID), "Groq")
    return {
        "total_leads": total,
        "contacted_leads": contacted,
        "total_calls": contacted,
        "active_provider": active_name
    }

@app.get("/api/providers")
def get_providers():
    return {"providers": PROVIDERS, "active_id": ACTIVE_PROVIDER_ID}

class SelectProvider(BaseModel):
    provider_id: int

@app.post("/api/providers/select")
def select_provider(req: SelectProvider):
    global ACTIVE_PROVIDER_ID
    ACTIVE_PROVIDER_ID = req.provider_id
    return {"status": "success", "active_id": ACTIVE_PROVIDER_ID}

@app.get("/api/leads")
def get_leads(search: str = ""):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    clean_search = "".join(filter(str.isalnum, search)).lower()
    
    if search.strip():
        cursor.execute("""
            SELECT id, name, phone, notes, status 
            FROM leads 
            WHERE LOWER(name) LIKE ? OR REPLACE(REPLACE(phone, '+', ''), ' ', '') LIKE ?
            ORDER BY id DESC
        """, (f"%{search.lower()}%", f"%{clean_search}%"))
    else:
        cursor.execute("SELECT id, name, phone, notes, status FROM leads ORDER BY id DESC")
        
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "phone": r[2], "notes": r[3], "status": r[4] or "New"} for r in rows]

@app.post("/api/leads")
def add_lead(lead: LeadCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    phone = lead.phone.strip()
    if not phone.startswith("+"):
        phone = "+" + phone.lstrip("1") if len(phone) == 10 else "+" + phone

    cursor.execute("""
        INSERT INTO leads (name, phone, notes, status)
        VALUES (?, ?, ?, 'New')
        ON CONFLICT(phone) DO UPDATE SET name=excluded.name, notes=excluded.notes
    """, (lead.name.strip(), phone, lead.notes.strip()))
    
    conn.commit()
    conn.close()
    return {"status": "saved"}

@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.post("/api/leads/import")
async def import_csv(file: UploadFile = File(...)):
    content = await file.read()
    decoded = content.decode('utf-8-sig')
    csv_reader = csv.DictReader(io.StringIO(decoded))
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    imported_count = 0
    
    for row in csv_reader:
        name = row.get("Name") or row.get("name") or row.get("Full Name") or "Unknown"
        phone = row.get("Phone") or row.get("phone") or row.get("Phone Number") or ""
        notes = row.get("Notes") or row.get("notes") or ""
        
        if phone:
            phone_str = str(phone).strip()
            if not phone_str.startswith("+"):
                phone_str = "+" + phone_str
            cursor.execute("""
                INSERT INTO leads (name, phone, notes, status)
                VALUES (?, ?, ?, 'New')
                ON CONFLICT(phone) DO UPDATE SET name=excluded.name, notes=excluded.notes
            """, (name.strip(), phone_str, notes.strip()))
            imported_count += 1
            
    conn.commit()
    conn.close()
    return {"status": "success", "imported": imported_count}

@app.get("/api/leads/export")
def export_csv():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name, phone, notes, status FROM leads")
    rows = cursor.fetchall()
    conn.close()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Phone", "Notes", "Status"])
    for row in rows:
        writer.writerow(row)
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8')),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"}
    )

@app.post("/api/call")
def dispatch_call(req: CallRequest):
    try:
        active_name = next((p["name"] for p in PROVIDERS if p["id"] == ACTIVE_PROVIDER_ID), "Groq")
        
        # Initialize Twilio Client using your API Key SID and API Key Secret
        client = Client(TELEPHONY_CONFIG["api_key_sid"], TELEPHONY_CONFIG["api_key_secret"], TELEPHONY_CONFIG["account_sid"])
        
        # Trigger actual call via Twilio
        call = client.calls.create(
            to=req.phone,
            from_=TELEPHONY_CONFIG["from_phone"],
            # Using Twilio's standard sample voice XML which reads out text when answered
            url="http://demo.twilio.com/docs/voice.xml"
        )
        
        mode_text = f"Live Twilio Call Dispatched (SID: {call.sid})"
        ai_reply = f"Successfully initiated live phone call from {TELEPHONY_CONFIG['from_phone']} to {req.phone} using {active_name} configuration."

        # Update database lead status
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE leads SET status = 'Contacted' WHERE phone = ?", (req.phone,))
        conn.commit()
        conn.close()
        
        return JSONResponse(content={
            "status": "success",
            "call_mode": mode_text,
            "ai_reply": ai_reply
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})