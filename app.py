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

DEAL_STAGES = ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            industry TEXT,
            website TEXT,
            location TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

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

    # Extend leads (contacts) with CRM fields, ignoring errors if columns already exist
    for ddl in [
        "ALTER TABLE leads ADD COLUMN email TEXT",
        "ALTER TABLE leads ADD COLUMN job_title TEXT",
        "ALTER TABLE leads ADD COLUMN company_id INTEGER",
        "ALTER TABLE leads ADD COLUMN tags TEXT",
        "ALTER TABLE leads ADD COLUMN lead_score INTEGER DEFAULT 0",
    ]:
        try:
            cursor.execute(ddl)
        except sqlite3.OperationalError:
            pass

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS deals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            contact_id INTEGER,
            company_id INTEGER,
            value REAL DEFAULT 0,
            stage TEXT DEFAULT 'New',
            probability INTEGER DEFAULT 20,
            close_date TEXT,
            owner TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    email: str = ""
    job_title: str = ""
    company_id: int | None = None
    tags: str = ""

class CompanyCreate(BaseModel):
    name: str
    industry: str = ""
    website: str = ""
    location: str = ""

class DealCreate(BaseModel):
    title: str
    contact_id: int | None = None
    company_id: int | None = None
    value: float = 0
    stage: str = "New"
    probability: int = 20
    close_date: str = ""
    owner: str = ""
    notes: str = ""

class DealStageUpdate(BaseModel):
    stage: str

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
            SELECT id, name, phone, notes, status, email, job_title, company_id, tags, lead_score
            FROM leads
            WHERE LOWER(name) LIKE ? OR REPLACE(REPLACE(phone, '+', ''), ' ', '') LIKE ?
            ORDER BY id DESC
        """, (f"%{search.lower()}%", f"%{clean_search}%"))
    else:
        cursor.execute("SELECT id, name, phone, notes, status, email, job_title, company_id, tags, lead_score FROM leads ORDER BY id DESC")

    rows = cursor.fetchall()
    conn.close()
    return [{
        "id": r[0], "name": r[1], "phone": r[2], "notes": r[3], "status": r[4] or "New",
        "email": r[5] or "", "job_title": r[6] or "", "company_id": r[7],
        "tags": r[8] or "", "lead_score": r[9] or 0
    } for r in rows]

@app.post("/api/leads")
def add_lead(lead: LeadCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    phone = lead.phone.strip()
    if not phone.startswith("+"):
        phone = "+" + phone.lstrip("1") if len(phone) == 10 else "+" + phone

    cursor.execute("""
        INSERT INTO leads (name, phone, notes, status, email, job_title, company_id, tags)
        VALUES (?, ?, ?, 'New', ?, ?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET
            name=excluded.name, notes=excluded.notes, email=excluded.email,
            job_title=excluded.job_title, company_id=excluded.company_id, tags=excluded.tags
    """, (lead.name.strip(), phone, lead.notes.strip(), lead.email.strip(),
          lead.job_title.strip(), lead.company_id, lead.tags.strip()))

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

# ---------- Companies ----------

@app.get("/api/companies")
def get_companies():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.id, c.name, c.industry, c.website, c.location,
               (SELECT COUNT(*) FROM leads WHERE company_id = c.id) as contact_count,
               (SELECT COUNT(*) FROM deals WHERE company_id = c.id) as deal_count
        FROM companies c ORDER BY c.id DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [{
        "id": r[0], "name": r[1], "industry": r[2] or "", "website": r[3] or "",
        "location": r[4] or "", "contact_count": r[5], "deal_count": r[6]
    } for r in rows]

@app.post("/api/companies")
def add_company(company: CompanyCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO companies (name, industry, website, location) VALUES (?, ?, ?, ?)
    """, (company.name.strip(), company.industry.strip(), company.website.strip(), company.location.strip()))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id}

@app.delete("/api/companies/{company_id}")
def delete_company(company_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM companies WHERE id = ?", (company_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# ---------- Deals / Pipeline ----------

@app.get("/api/deals")
def get_deals():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.id, d.title, d.contact_id, d.company_id, d.value, d.stage, d.probability,
               d.close_date, d.owner, d.notes, l.name, c.name
        FROM deals d
        LEFT JOIN leads l ON d.contact_id = l.id
        LEFT JOIN companies c ON d.company_id = c.id
        ORDER BY d.id DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [{
        "id": r[0], "title": r[1], "contact_id": r[2], "company_id": r[3], "value": r[4],
        "stage": r[5], "probability": r[6], "close_date": r[7] or "", "owner": r[8] or "",
        "notes": r[9] or "", "contact_name": r[10] or "", "company_name": r[11] or ""
    } for r in rows]

@app.get("/api/deals/stages")
def get_deal_stages():
    return {"stages": DEAL_STAGES}

@app.post("/api/deals")
def add_deal(deal: DealCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    stage = deal.stage if deal.stage in DEAL_STAGES else "New"
    cursor.execute("""
        INSERT INTO deals (title, contact_id, company_id, value, stage, probability, close_date, owner, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (deal.title.strip(), deal.contact_id, deal.company_id, deal.value, stage,
          deal.probability, deal.close_date, deal.owner.strip(), deal.notes.strip()))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id}

@app.patch("/api/deals/{deal_id}/stage")
def update_deal_stage(deal_id: int, req: DealStageUpdate):
    if req.stage not in DEAL_STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE deals SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.stage, deal_id))
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.delete("/api/deals/{deal_id}")
def delete_deal(deal_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM deals WHERE id = ?", (deal_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# ---------- Dashboard ----------

@app.get("/api/dashboard")
def get_dashboard():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM leads")
    total_contacts = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM leads WHERE date(created_at) = date('now')")
    leads_today = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM companies")
    total_companies = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(value), 0) FROM deals WHERE stage NOT IN ('Won', 'Lost')")
    pipeline_value = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(value), 0) FROM deals WHERE stage = 'Won'")
    revenue_won = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(value), 0) FROM deals WHERE stage = 'Lost'")
    revenue_lost = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM deals WHERE stage NOT IN ('Won', 'Lost')")
    open_deals = cursor.fetchone()[0]

    cursor.execute("""
        SELECT COUNT(*) FROM deals
        WHERE stage NOT IN ('Won', 'Lost')
        AND julianday('now') - julianday(updated_at) > 14
    """)
    deals_at_risk = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM deals WHERE stage = 'Won'")
    won_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM deals")
    total_deals = cursor.fetchone()[0]
    conversion_rate = round((won_count / total_deals) * 100, 1) if total_deals else 0

    cursor.execute("""
        SELECT stage, COUNT(*), COALESCE(SUM(value), 0) FROM deals GROUP BY stage
    """)
    by_stage = {row[0]: {"count": row[1], "value": row[2]} for row in cursor.fetchall()}

    conn.close()

    return {
        "total_contacts": total_contacts,
        "leads_today": leads_today,
        "total_companies": total_companies,
        "pipeline_value": pipeline_value,
        "revenue_won": revenue_won,
        "revenue_lost": revenue_lost,
        "open_deals": open_deals,
        "deals_at_risk": deals_at_risk,
        "conversion_rate": conversion_rate,
        "by_stage": by_stage
    }