"""
Initialize default document types in the database.
Run this script once to set up default types, or call DocumentTypeModel.initialize_default_types()
"""
import os
import sys

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from models.database import Database, DocumentTypeModel

def initialize_types():
    """Initialize default document types"""
    print("Connecting to database...")
    Database.connect()
    
    print("Initializing default document types...")
    count = DocumentTypeModel.initialize_default_types()
    
    print(f"Initialized {count} new document types.")
    
    # Show all available types
    all_types = DocumentTypeModel.get_all_types()
    print(f"\nTotal document types available: {len(all_types)}")
    print("\nAvailable types:")
    for doc_type in all_types:
        print(f"  - {doc_type['type_name']}: {doc_type['description']}")
        if doc_type.get('metadata_schema'):
            print(f"    Metadata schema: {doc_type['metadata_schema']}")

if __name__ == "__main__":
    initialize_types()

