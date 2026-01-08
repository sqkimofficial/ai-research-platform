from services.openai_service import OpenAIService
from models.database import DocumentEmbeddingModel
from utils.html_helpers import strip_html_tags
from utils.logger import get_logger
import numpy as np
from typing import List, Dict
import uuid

logger = get_logger(__name__)

class VectorService:
    def __init__(self):
        self.openai_service = OpenAIService()
        self.chunk_size = 1000  # Characters per chunk (increased for better context)
        self.chunk_overlap = 100  # Overlap between chunks (increased for better continuity)
    
    def chunk_text(self, text: str) -> List[Dict[str, any]]:
        """Split text into chunks with metadata"""
        chunks = []
        if not text or not text.strip():
            return chunks
        
        # Split by paragraphs first
        paragraphs = text.split('\n\n')
        current_chunk = ""
        chunk_index = 0
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            # If adding this paragraph would exceed chunk size, save current chunk
            if current_chunk and len(current_chunk) + len(para) + 2 > self.chunk_size:
                chunks.append({
                    'text': current_chunk.strip(),
                    'index': chunk_index,
                    'start_char': 0,  # Simplified for now
                    'end_char': len(current_chunk)
                })
                chunk_index += 1
                # Start new chunk with overlap
                current_chunk = current_chunk[-self.chunk_overlap:] + '\n\n' + para
            else:
                if current_chunk:
                    current_chunk += '\n\n' + para
                else:
                    current_chunk = para
        
        # Add final chunk
        if current_chunk.strip():
            chunks.append({
                'text': current_chunk.strip(),
                'index': chunk_index,
                'start_char': 0,
                'end_char': len(current_chunk)
            })
        
        return chunks
    
    def index_document(self, session_id: str, document_text: str) -> bool:
        """Create embeddings for document chunks and store in database"""
        try:
            # Use session_id as document_id for now
            document_id = session_id
            
            # Delete existing embeddings for this document
            DocumentEmbeddingModel.delete_embeddings_by_document(document_id)
            
            # Strip HTML tags for cleaner embeddings (document_text is HTML)
            plain_text = strip_html_tags(document_text)
            
            # Chunk the document
            chunks = self.chunk_text(plain_text)
            
            if not chunks:
                return True
            
            # Create embeddings for each chunk
            for chunk in chunks:
                embedding = self.openai_service.create_embedding(chunk['text'])
                
                # Store in database
                DocumentEmbeddingModel.create_embedding(
                    document_id=document_id,
                    chunk_index=chunk['index'],
                    chunk_text=chunk['text'],
                    embedding=embedding,
                    metadata={
                        'session_id': session_id,
                        'start_char': chunk['start_char'],
                        'end_char': chunk['end_char']
                    }
                )
            
            return True
        except Exception as e:
            logger.error(f"Error indexing document: {e}")
            return False
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        vec1 = np.array(vec1)
        vec2 = np.array(vec2)
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot_product / (norm1 * norm2)
    
    def search_relevant_chunks(self, session_id: str, query: str, top_k: int = 3) -> List[Dict]:
        """Find most relevant document chunks for a query using semantic search"""
        try:
            document_id = session_id
            
            # Get query embedding
            query_embedding = self.openai_service.create_embedding(query)
            
            # Get all embeddings for this document
            embeddings = DocumentEmbeddingModel.get_embeddings_by_document(document_id)
            
            if not embeddings:
                return []
            
            # Calculate similarity scores
            results = []
            for emb_doc in embeddings:
                similarity = self.cosine_similarity(query_embedding, emb_doc['embedding'])
                results.append({
                    'chunk_text': emb_doc['chunk_text'],
                    'chunk_index': emb_doc['chunk_index'],
                    'similarity': similarity,
                    'metadata': emb_doc.get('metadata', {})
                })
            
            # Sort by similarity and return top_k
            results.sort(key=lambda x: x['similarity'], reverse=True)
            return results[:top_k]
        
        except Exception as e:
            logger.error(f"Error in semantic search: {e}")
            return []

