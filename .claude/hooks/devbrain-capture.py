"""
Stop hook: auto-capture insights to devbrain after each agent turn.
Reads the current session transcript, checks for signal words,
then calls Gemini to extract one concrete note if something worth saving happened.
"""
import sys
import json
import os
import glob
import subprocess
import urllib.request
import urllib.error
import datetime

home = os.path.expanduser("~")
log_file = os.path.join(home, ".devbrain", "hook.log")


def log(msg):
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"[{ts}] {msg}\n")
    except Exception:
        pass


# 1. Find the most recently modified JSONL transcript = current session
pattern = os.path.join(home, ".claude", "projects", "*", "*.jsonl")
files = glob.glob(pattern)
if not files:
    sys.exit(0)

latest = max(files, key=os.path.getmtime)

# 2. Read last 120 lines (up from 80 — catches multi-step fixes)
try:
    with open(latest, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()[-120:]
except Exception as e:
    log(f"read error: {e}")
    sys.exit(0)

# 3. Extract text from the last assistant turn only
text_parts = []
found_assistant = False
for line in reversed(lines):
    try:
        ev = json.loads(line.strip())
        role = ev.get("type") or ev.get("role", "")
        if role == "assistant":
            found_assistant = True
            content = ev.get("message", {}).get("content") or ev.get("content", "")
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text_parts.insert(0, block.get("text", ""))
            elif isinstance(content, str) and content:
                text_parts.insert(0, content)
        elif found_assistant and role == "user":
            break
    except Exception:
        continue

text = "\n".join(text_parts).strip()
if len(text) < 80:
    sys.exit(0)

# 4. Keyword gate — skip if no signal words present
SIGNALS = [
    "fix", "issue was", "root cause", "the problem", "resolved", "the reason",
    "pattern", "lesson", "workaround", "discovered", "turns out", "the bug",
    "caused by", "key insight", "the error", "missing", "incorrect", "the trick",
    "error was", "failed because", "the cause", "gotcha", "important:",
]
if not any(s in text.lower() for s in SIGNALS):
    sys.exit(0)

# 5. Load Gemini API key
api_key = ""
env_file = os.path.join(home, ".devbrain", ".env")
try:
    with open(env_file) as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                api_key = line.strip().split("=", 1)[1].strip()
                break
except Exception as e:
    log(f"env read error: {e}")

if not api_key:
    log("no GEMINI_API_KEY found")
    sys.exit(0)

# 6. Ask Gemini to extract one devbrain note
# Use gemini-2.0-flash-lite — cheaper model, separate quota from the main app
excerpt = text[-2000:]
prompt = f"""You are extracting developer knowledge from a coding session transcript.

Read the excerpt below and output ONE devbrain note if something genuinely non-obvious was learned or fixed.

Worth capturing:
- Bug root cause (what was actually wrong, not just that it was fixed)
- API quirk or undocumented behavior
- Pattern worth reusing across projects
- Decision with real tradeoffs
- Non-obvious fix or workaround

NOT worth capturing:
- Routine code edits
- Simple file reads or searches
- Explaining obvious things
- Summaries without insight

Format: start with fix: / pattern: / decision: / lesson: — then the concrete insight. Max 130 chars.
If nothing worth capturing: output exactly SKIP

Excerpt:
{excerpt}

Output:"""

payload = json.dumps({
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {"maxOutputTokens": 60, "temperature": 0.0},
})

# gemini-2.0-flash-lite: cheaper, higher rate limits, separate quota from gemini-2.0-flash
url = (
    "https://generativelanguage.googleapis.com/v1beta"
    f"/models/gemini-2.0-flash-lite:generateContent?key={api_key}"
)

try:
    req = urllib.request.Request(
        url,
        data=payload.encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read())
    note = result["candidates"][0]["content"]["parts"][0]["text"].strip()
    if note and not note.upper().startswith("SKIP"):
        log(f"saving: {note[:80]}")
        subprocess.run(["devbrain", "note", note], capture_output=True)
    else:
        log("SKIP")
except urllib.error.HTTPError as e:
    body = e.read().decode(errors="ignore")[:200]
    log(f"HTTP {e.code}: {body}")
except Exception as e:
    log(f"error: {e}")

sys.exit(0)
