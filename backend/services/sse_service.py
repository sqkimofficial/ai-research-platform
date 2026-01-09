"""
Server-Sent Events (SSE) Service for real-time notifications.

This service manages SSE connections and broadcasts events to connected clients.
Used for notifying frontend when PDF extraction completes.
"""

import json
import time
from typing import Dict, Set
from threading import Lock
from utils.logger import get_logger

logger = get_logger(__name__)


class SSEService:
    """Service for managing SSE connections and broadcasting events."""
    
    _connections: Dict[str, Dict[str, Set]] = {}  # user_id -> {connection_type -> set of connection queues}
    _lock = Lock()
    
    @classmethod
    def add_connection(cls, user_id: str, queue, connection_type: str = 'default'):
        """Add a new SSE connection for a user with a connection type.
        
        Args:
            user_id: User ID
            queue: Queue for this connection
            connection_type: Type of connection ('agent_steps', 'pdf', 'default')
        """
        with cls._lock:
            if user_id not in cls._connections:
                cls._connections[user_id] = {}
            if connection_type not in cls._connections[user_id]:
                cls._connections[user_id][connection_type] = set()
            cls._connections[user_id][connection_type].add(queue)
            total = sum(len(conns) for conns in cls._connections[user_id].values())
            logger.debug(f"[SSE] Added {connection_type} connection for user {user_id}. Total connections: {total}")
    
    @classmethod
    def remove_connection(cls, user_id: str, queue, connection_type: str = 'default'):
        """Remove an SSE connection for a user."""
        with cls._lock:
            if user_id in cls._connections and connection_type in cls._connections[user_id]:
                cls._connections[user_id][connection_type].discard(queue)
                if len(cls._connections[user_id][connection_type]) == 0:
                    del cls._connections[user_id][connection_type]
                if len(cls._connections[user_id]) == 0:
                    del cls._connections[user_id]
                logger.debug(f"[SSE] Removed {connection_type} connection for user {user_id}")
    
    @classmethod
    def broadcast_to_user(cls, user_id: str, event_type: str, data: dict, connection_type: str = None):
        """Broadcast an event to connections for a specific user.
        
        Args:
            user_id: User ID
            event_type: Type of event
            data: Event data
            connection_type: If specified, only send to this connection type. 
                           If None, send to all connections.
                           'agent_step' events go to 'agent_steps' connections.
                           PDF/extraction events go to 'pdf' connections.
        """
        with cls._lock:
            if user_id not in cls._connections:
                logger.debug(f"[SSE] No connections for user {user_id}, skipping broadcast")
                return
            
            # Traffic light: Route events based on type
            target_types = []
            if connection_type:
                # Explicit connection type specified
                target_types = [connection_type]
            elif event_type == 'agent_step':
                # Agent steps go to agent_steps connections
                target_types = ['agent_steps']
            elif event_type in ['extraction_started', 'extraction_complete', 'extraction_failed', 'highlight_saved']:
                # PDF events go to pdf connections
                target_types = ['pdf']
            else:
                # Default: send to all connection types
                target_types = list(cls._connections[user_id].keys())
            
            event_data = {
                'type': event_type,
                'data': data,
                'timestamp': time.time()
            }
            
            # Send to target connection types
            total_sent = 0
            disconnected = []
            for conn_type in target_types:
                if conn_type in cls._connections[user_id]:
                    for queue in cls._connections[user_id][conn_type]:
                        try:
                            queue.put(event_data)
                            total_sent += 1
                        except Exception as e:
                            logger.warning(f"[SSE] Error sending to {conn_type} connection: {e}")
                            disconnected.append((conn_type, queue))
            
            # Remove disconnected connections
            for conn_type, queue in disconnected:
                if user_id in cls._connections and conn_type in cls._connections[user_id]:
                    cls._connections[user_id][conn_type].discard(queue)
            
            logger.debug(f"[SSE] Broadcasted {event_type} to {total_sent} {target_types} connection(s) for user {user_id}")
    
    @classmethod
    def get_connection_count(cls, user_id: str = None) -> int:
        """Get the number of active connections."""
        with cls._lock:
            if user_id:
                return sum(len(conns) for conns in cls._connections.get(user_id, {}).values())
            return sum(sum(len(conns) for conns in user_conns.values()) for user_conns in cls._connections.values())


