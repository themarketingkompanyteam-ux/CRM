import os
import sqlite3
import asyncio
from fastmcp import FastMCP
from agent import PROVIDER_POOL, rotator, text_to_speech, COLD_CALLING_PROMPT
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
DB_PATH = os.path.join(DATA_DIR, "crm.db")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'Pending',
            notes TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

mcp = FastMCP("Company-Portable-CRM")

@mcp.tool()
def add_lead(name: str, phone: str, notes: str = "") -> str:
    """Adds a new lead into the portable local CRM database."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO leads (name, phone, notes) VALUES (?, ?, ?)", (name, phone, notes))
        conn.commit()
        return f"✅ Lead '{name}' ({phone}) added successfully to database."
    except sqlite3.IntegrityError:
        return f"⚠️ Lead with phone number {phone} already exists."
    finally:
        conn.close()

@mcp.tool()
def list_leads() -> str:
    """Retrieves all lead records from the CRM database."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, status, notes FROM leads")
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return "CRM database is empty. No leads found."

    output = ["📋 **Company CRM Pipeline:**"]
    for row in rows:
        output.append(f"• [ID: {row[0]}] {row[1]} | Phone: {row[2]} | Status: {row[3]} | Notes: {row[4]}")
    return "\n".join(output)

@mcp.tool()
async def trigger_cold_call(phone: str, message: str = "Hello, who is this?") -> str:
    """Triggers an AI outbound cold call to a lead using the model failover pool."""
    provider = rotator.get_current_provider()
    
    client_kwargs = {"api_key": provider["api_key"]}
    if provider["base_url"]:
        client_kwargs["base_url"] = provider["base_url"]
        
    client = OpenAI(**client_kwargs)
    
    response = client.chat.completions.create(
        model=provider["model"],
        max_tokens=150,
        messages=[
            {"role": "system", "content": COLD_CALLING_PROMPT},
            {"role": "user", "content": message}
        ]
    )
    
    ai_reply = response.choices[0].message.content
    audio_file = os.path.join(AUDIO_DIR, f"call_{phone.replace('+', '')}.mp3")
    await text_to_speech(ai_reply, audio_file)
    
    return f"📞 Call triggered for {phone}\n• Provider: {provider['name']} ({provider['model']})\n• AI Script: '{ai_reply}'\n• Voice file: {audio_file}"

if __name__ == "__main__":
    mcp.run()