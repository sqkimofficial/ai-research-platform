"""
Server-Sent Events (SSE) Service for real-time notifications.

This service manages SSE connections and broadcasts events to connected clients.
Used for notifying frontend when PDF extraction completes.
"""

import json
import time
from typing import Dict, Set
from threading import Lock


class SSEService:
    """Service for managing SSE connections and broadcasting events."""
    
    _connections: Dict[str, Set] = {}  # user_id -> set of connection queues
    _lock = Lock()
    
    @classmethod
    def add_connection(cls, user_id: str, queue):
        """Add a new SSE connection for a user."""
        with cls._lock:
            if user_id not in cls._connections:
                cls._connections[user_id] = set()
            cls._connections[user_id].add(queue)
            print(f"[SSE] Added connection for user {user_id}. Total connections: {len(cls._connections[user_id])}")
    
    @classmethod
    def remove_connection(cls, user_id: str, queue):
        """Remove an SSE connection for a user."""
        with cls._lock:
            if user_id in cls._connections:
                cls._connections[user_id].discard(queue)
                if len(cls._connections[user_id]) == 0:
                    del cls._connections[user_id]
                print(f"[SSE] Removed connection for user {user_id}")
    
    @classmethod
    def broadcast_to_user(cls, user_id: str, event_type: str, data: dict):
        """Broadcast an event to all connections for a specific user."""
        with cls._lock:
            if user_id not in cls._connections:
                print(f"[SSE] No connections for user {user_id}, skipping broadcast")
                return
            
            event_data = {
                'type': event_type,
                'data': data,
                'timestamp': time.time()
            }
            
            # Send to all connections for this user
            disconnected = []
            for queue in cls._connections[user_id]:
                try:
                    queue.put(event_data)
                except Exception as e:
                    print(f"[SSE] Error sending to connection: {e}")
                    disconnected.append(queue)
            
            # Remove disconnected connections
            for queue in disconnected:
                cls._connections[user_id].discard(queue)
            
            print(f"[SSE] Broadcasted {event_type} to {len(cls._connections[user_id])} connections for user {user_id}")
    
    @classmethod
    def get_connection_count(cls, user_id: str = None) -> int:
        """Get the number of active connections."""
        with cls._lock:
            if user_id:
                return len(cls._connections.get(user_id, set()))
            return sum(len(conns) for conns in cls._connections.values())


