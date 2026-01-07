"""
Migration script to move PDF highlights from pdf_documents collection to highlights collection.

This script:
1. Finds all PDF documents with highlights in the pdf_documents collection
2. For each PDF, moves its highlights to the highlights collection using the PDF's S3 URL as source_url
3. Removes the highlights array from pdf_documents collection

Run this script once to migrate existing data.
"""
import sys
import os

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from models.database import Database, PDFDocumentModel, HighlightModel
from datetime import datetime
import uuid

def migrate_pdf_highlights():
    """Migrate all PDF highlights from pdf_documents to highlights collection."""
    db = Database.get_db()
    
    # Find all PDF documents that have highlights
    pdf_docs = list(db.pdf_documents.find({
        'highlights': {'$exists': True, '$ne': []}
    }))
    
    print(f"Found {len(pdf_docs)} PDF documents with highlights to migrate")
    
    migrated_count = 0
    error_count = 0
    
    for pdf_doc in pdf_docs:
        pdf_id = pdf_doc.get('pdf_id')
        user_id = pdf_doc.get('user_id')
        project_id = pdf_doc.get('project_id')
        file_url = pdf_doc.get('file_url')
        filename = pdf_doc.get('filename', 'Untitled Document')
        highlights = pdf_doc.get('highlights', [])
        
        if not file_url:
            print(f"  [SKIP] PDF {pdf_id}: No file_url (S3 URL), skipping migration")
            error_count += 1
            continue
        
        if not highlights:
            print(f"  [SKIP] PDF {pdf_id}: No highlights to migrate")
            continue
        
        print(f"  [MIGRATE] PDF {pdf_id}: Migrating {len(highlights)} highlights...")
        
        try:
            # Save each highlight to highlights collection
            for highlight in highlights:
                highlight_id = highlight.get('highlight_id')
                if not highlight_id:
                    highlight_id = str(uuid.uuid4())
                
                HighlightModel.save_highlight(
                    user_id=user_id,
                    project_id=project_id,
                    source_url=file_url,  # Use S3 URL as source_url
                    page_title=filename,
                    highlight_text=highlight.get('text', ''),
                    note=highlight.get('note'),
                    tags=highlight.get('tags', []),
                    preview_image_url=highlight.get('preview_image_url'),
                    highlight_id=highlight_id,
                    page_number=highlight.get('page_number'),
                    color_tag=highlight.get('color_tag')
                )
            
            # Remove highlights array from pdf_documents
            db.pdf_documents.update_one(
                {'pdf_id': pdf_id},
                {'$unset': {'highlights': ''}}
            )
            
            print(f"  [SUCCESS] PDF {pdf_id}: Migrated {len(highlights)} highlights")
            migrated_count += 1
            
        except Exception as e:
            print(f"  [ERROR] PDF {pdf_id}: Failed to migrate - {e}")
            error_count += 1
            import traceback
            traceback.print_exc()
    
    print(f"\nMigration complete:")
    print(f"  - Successfully migrated: {migrated_count} PDFs")
    print(f"  - Errors/Skipped: {error_count} PDFs")
    print(f"  - Total processed: {len(pdf_docs)} PDFs")

if __name__ == '__main__':
    print("Starting PDF highlights migration...")
    print("=" * 60)
    migrate_pdf_highlights()
    print("=" * 60)
    print("Migration finished.")

