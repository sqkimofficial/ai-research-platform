import os
import json
from pathlib import Path

def get_session_dir(session_id):
    """Get or create the directory for a session"""
    base_dir = Path(__file__).parent.parent / 'data' / 'sessions'
    session_dir = base_dir / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir

def load_json(file_path):
    """Load JSON from a file"""
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None

def save_json(file_path, data):
    """Save data as JSON to a file"""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

