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
    
    def index_document(self, session_id: str, document_text: str, 
                      user_id: str = None, project_id: str = None) -> bool:
        """
        Create embeddings for document chunks and store in database.
        
        Args:
            session_id: Session ID (used as document_id)
            document_text: HTML document text
            user_id: Optional user ID for multi-source support
            project_id: Optional project ID for multi-source support
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Use session_id as document_id for backward compatibility
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
                
                # Store in database with optional multi-source fields
                DocumentEmbeddingModel.create_embedding(
                    document_id=document_id,
                    chunk_index=chunk['index'],
                    chunk_text=chunk['text'],
                    embedding=embedding,
                    metadata={
                        'session_id': session_id,
                        'start_char': chunk['start_char'],
                        'end_char': chunk['end_char']
                    },
                    source_type='research_document' if user_id else None,
                    source_id=document_id if user_id else None,
                    project_id=project_id,
                    user_id=user_id
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
    
    def index_highlight(self, highlight_id: str, text: str, user_id: str, project_id: str, source_url: str = None) -> bool:
        """
        Index a highlight (text + note) for semantic search.
        
        Args:
            highlight_id: Highlight ID
            text: Combined highlight text and note
            user_id: User ID
            project_id: Project ID
            source_url: Optional source URL for metadata
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Delete existing embeddings for this highlight
            DocumentEmbeddingModel.delete_embeddings_by_source('highlight', highlight_id, user_id)
            
            if not text or not text.strip():
                return True
            
            # Chunk the text
            chunks = self.chunk_text(text)
            
            if not chunks:
                return True
            
            # Create embeddings for each chunk
            for chunk in chunks:
                embedding = self.openai_service.create_embedding(chunk['text'])
                
                # Store in database with source metadata
                DocumentEmbeddingModel.create_embedding(
                    document_id=highlight_id,  # Use highlight_id as document_id for backward compatibility
                    chunk_index=chunk['index'],
                    chunk_text=chunk['text'],
                    embedding=embedding,
                    metadata={
                        'highlight_id': highlight_id,
                        'source_url': source_url,
                        'start_char': chunk['start_char'],
                        'end_char': chunk['end_char']
                    },
                    source_type='highlight',
                    source_id=highlight_id,
                    project_id=project_id,
                    user_id=user_id
                )
            
            logger.debug(f"Indexed highlight {highlight_id} with {len(chunks)} chunks")
            return True
        except Exception as e:
            logger.error(f"Error indexing highlight: {e}")
            return False
    
    def index_pdf_full_text(self, pdf_id: str, full_text: str, user_id: str, project_id: str) -> bool:
        """
        Index full PDF text for semantic search.
        
        Args:
            pdf_id: PDF document ID
            full_text: Full text extracted from PDF
            user_id: User ID
            project_id: Project ID
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Delete existing embeddings for this PDF
            DocumentEmbeddingModel.delete_embeddings_by_source('pdf', pdf_id, user_id)
            
            if not full_text or not full_text.strip():
                return True
            
            # Chunk the text
            chunks = self.chunk_text(full_text)
            
            if not chunks:
                return True
            
            # Create embeddings for each chunk
            for chunk in chunks:
                embedding = self.openai_service.create_embedding(chunk['text'])
                
                # Store in database with source metadata
                DocumentEmbeddingModel.create_embedding(
                    document_id=pdf_id,  # Use pdf_id as document_id for backward compatibility
                    chunk_index=chunk['index'],
                    chunk_text=chunk['text'],
                    embedding=embedding,
                    metadata={
                        'pdf_id': pdf_id,
                        'start_char': chunk['start_char'],
                        'end_char': chunk['end_char']
                    },
                    source_type='pdf',
                    source_id=pdf_id,
                    project_id=project_id,
                    user_id=user_id
                )
            
            logger.debug(f"Indexed PDF {pdf_id} full text with {len(chunks)} chunks")
            return True
        except Exception as e:
            logger.error(f"Error indexing PDF full text: {e}")
            return False
    
    def index_image_ocr(self, image_id: str, ocr_text: str, user_id: str, project_id: str) -> bool:
        """
        Index OCR text from an image for semantic search.
        
        Args:
            image_id: Image ID (can be pdf_id if image is part of PDF)
            ocr_text: Full OCR text from image
            user_id: User ID
            project_id: Project ID
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Delete existing embeddings for this image
            DocumentEmbeddingModel.delete_embeddings_by_source('image_ocr', image_id, user_id)
            
            if not ocr_text or not ocr_text.strip():
                return True
            
            # Chunk the text
            chunks = self.chunk_text(ocr_text)
            
            if not chunks:
                return True
            
            # Create embeddings for each chunk
            for chunk in chunks:
                embedding = self.openai_service.create_embedding(chunk['text'])
                
                # Store in database with source metadata
                DocumentEmbeddingModel.create_embedding(
                    document_id=image_id,  # Use image_id as document_id for backward compatibility
                    chunk_index=chunk['index'],
                    chunk_text=chunk['text'],
                    embedding=embedding,
                    metadata={
                        'image_id': image_id,
                        'start_char': chunk['start_char'],
                        'end_char': chunk['end_char']
                    },
                    source_type='image_ocr',
                    source_id=image_id,
                    project_id=project_id,
                    user_id=user_id
                )
            
            logger.debug(f"Indexed image OCR {image_id} with {len(chunks)} chunks")
            return True
        except Exception as e:
            logger.error(f"Error indexing image OCR: {e}")
            return False
    
    def search_relevant_chunks(self, session_id: str, query: str, top_k: int = 3, 
                              user_id: str = None, project_id: str = None, 
                              source_types: List[str] = None) -> List[Dict]:
        """
        Find most relevant document chunks for a query using semantic search.
        Supports multi-source search with filtering.
        
        Args:
            session_id: Session ID (for backward compatibility with research documents)
            query: Search query
            top_k: Number of top results to return
            user_id: Optional user ID for filtering
            project_id: Optional project ID for filtering
            source_types: Optional list of source types to filter by ('research_document', 'highlight', 'pdf', 'image_ocr')
        
        Returns:
            List of relevant chunks with similarity scores and metadata
        """
        try:
            # Get query embedding
            query_embedding = self.openai_service.create_embedding(query)
            
            # Get embeddings based on filters
            if user_id:
                # Multi-source search with filters
                embeddings = DocumentEmbeddingModel.get_embeddings_by_filters(
                    user_id=user_id,
                    project_id=project_id,
                    source_types=source_types
                )
            else:
                # Backward compatibility: search by session_id (document_id)
                document_id = session_id
                embeddings = DocumentEmbeddingModel.get_embeddings_by_document(document_id)
            
            if not embeddings:
                return []
            
            # Calculate similarity scores
            results = []
            for emb_doc in embeddings:
                similarity = self.cosine_similarity(query_embedding, emb_doc['embedding'])
                
                # Build result with source metadata
                result = {
                    'chunk_text': emb_doc['chunk_text'],
                    'chunk_index': emb_doc.get('chunk_index', 0),
                    'similarity': similarity,
                    'metadata': emb_doc.get('metadata', {})
                }
                
                # Add source type and ID if available
                if 'source_type' in emb_doc:
                    result['source_type'] = emb_doc['source_type']
                if 'source_id' in emb_doc:
                    result['source_id'] = emb_doc['source_id']
                if 'project_id' in emb_doc:
                    result['project_id'] = emb_doc['project_id']
                
                results.append(result)
            
            # Sort by similarity and return top_k
            results.sort(key=lambda x: x['similarity'], reverse=True)
            return results[:top_k]
        
        except Exception as e:
            logger.error(f"Error in semantic search: {e}")
            return []

