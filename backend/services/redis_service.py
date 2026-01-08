"""
Redis Service for server-side caching.
Handles connection management, caching operations, and error handling.
"""
import redis
import json
import os
from typing import Optional, Any, List
from config import Config
from utils.logger import get_logger

logger = get_logger(__name__)


class RedisService:
    """Redis service for caching with connection pooling and graceful degradation."""
    
    _instance: Optional['RedisService'] = None
    _client: Optional[redis.Redis] = None
    _enabled: bool = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RedisService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            self._initialize_connection()
    
    def _initialize_connection(self):
        """Initialize Redis connection with configuration from Config."""
        try:
            host = Config.REDIS_HOST
            port = Config.REDIS_PORT
            password = Config.REDIS_PASSWORD
            db = Config.REDIS_DB
            
            logger.debug(f"[REDIS] Connecting to Redis: {host}:{port}")
            
            # Create connection pool for production
            self._client = redis.Redis(
                host=host,
                port=port,
                password=password,
                db=db,
                decode_responses=False,  # Return bytes, we'll decode ourselves
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )
            
            # Test connection
            self._client.ping()
            self._enabled = True
            logger.info("[REDIS] Connected successfully")
            
        except Exception as e:
            logger.warning(f"[REDIS] Connection failed: {e}")
            logger.warning("[REDIS] Caching disabled, falling back to MongoDB")
            self._enabled = False
            self._client = None
    
    @property
    def is_enabled(self) -> bool:
        """Check if Redis is enabled and connected."""
        if not self._enabled or self._client is None:
            return False
        try:
            self._client.ping()
            return True
        except Exception:
            self._enabled = False
            return False
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get cached data by key.
        
        Args:
            key: Cache key
            
        Returns:
            Cached data (deserialized JSON) or None if not found
        """
        if not self.is_enabled:
            return None
        
        try:
            logger.debug(f"[REDIS] Cache get: {key}")
            data = self._client.get(key)
            if data is None:
                logger.debug(f"[REDIS] Cache miss: {key}")
                return None
            
            # Deserialize JSON
            decoded_data = json.loads(data.decode('utf-8'))
            logger.debug(f"[REDIS] Cache hit: {key}")
            return decoded_data
            
        except json.JSONDecodeError as e:
            logger.debug(f"[REDIS] Error deserializing cache for {key}: {e}")
            # Delete corrupted cache entry
            self.delete(key)
            return None
        except Exception as e:
            logger.debug(f"[REDIS] Error getting cache for {key}: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """
        Set cached data with TTL.
        
        Args:
            key: Cache key
            value: Data to cache (will be serialized to JSON)
            ttl: Time to live in seconds (default: 300 = 5 minutes)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_enabled:
            return False
        
        try:
            # Serialize to JSON
            json_data = json.dumps(value, default=str)  # default=str handles datetime objects
            self._client.setex(key, ttl, json_data)
            logger.debug(f"[REDIS] Cache set: {key}, TTL: {ttl}s")
            return True
            
        except (TypeError, ValueError) as e:
            logger.debug(f"[REDIS] Error serializing cache for {key}: {e}")
            return False
        except Exception as e:
            logger.debug(f"[REDIS] Error setting cache for {key}: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """
        Delete cache entry by key.
        
        Args:
            key: Cache key
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_enabled:
            return False
        
        try:
            result = self._client.delete(key)
            if result > 0:
                logger.debug(f"[REDIS] Cache delete: {key}")
            return result > 0
        except Exception as e:
            logger.debug(f"[REDIS] Error deleting cache for {key}: {e}")
            return False
    
    def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching pattern.
        Use with caution in production!
        
        Args:
            pattern: Redis key pattern (e.g., "cache:documents:*")
            
        Returns:
            Number of keys deleted
        """
        if not self.is_enabled:
            return 0
        
        try:
            keys = self._client.keys(pattern)
            if keys:
                deleted = self._client.delete(*keys)
                logger.debug(f"[REDIS] Cache delete_pattern: {pattern}, deleted {deleted} keys")
                return deleted
            return 0
        except Exception as e:
            logger.debug(f"[REDIS] Error deleting cache pattern {pattern}: {e}")
            return 0
    
    def exists(self, key: str) -> bool:
        """
        Check if key exists in cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key exists, False otherwise
        """
        if not self.is_enabled:
            return False
        
        try:
            return bool(self._client.exists(key))
        except Exception as e:
            logger.debug(f"[REDIS] Error checking existence for {key}: {e}")
            return False


# Global instance
_redis_service: Optional[RedisService] = None


def get_redis_service() -> RedisService:
    """Get or create Redis service instance."""
    global _redis_service
    if _redis_service is None:
        _redis_service = RedisService()
    return _redis_service


