"""
Utility functions for HTML processing.
Used for stripping HTML tags when sending content to AI or creating embeddings.
"""
import re
from html.parser import HTMLParser


class HTMLStripper(HTMLParser):
    """HTML parser that extracts text content while preserving structure"""
    def __init__(self):
        super().__init__()
        self.text = []
        self.in_code_block = False
        self.in_table = False
        self.current_code_lang = None
    
    def handle_starttag(self, tag, attrs):
        if tag == 'pre':
            self.in_code_block = True
            # Try to get language from code tag
            for attr_name, attr_value in attrs:
                if attr_name == 'class' and attr_value:
                    lang_match = re.search(r'language-(\w+)', attr_value)
                    if lang_match:
                        self.current_code_lang = lang_match.group(1)
        elif tag == 'code' and self.in_code_block:
            # Code block start
            if self.current_code_lang:
                self.text.append(f'\n```{self.current_code_lang}\n')
            else:
                self.text.append('\n```\n')
        elif tag == 'table':
            self.in_table = True
            self.text.append('\n\n[TABLE]\n')
        elif tag in ['tr', 'th', 'td'] and self.in_table:
            # Add separators for table structure
            if tag == 'tr':
                self.text.append('\n')
            elif tag == 'th' or tag == 'td':
                self.text.append(' | ')
    
    def handle_endtag(self, tag):
        if tag == 'pre':
            self.in_code_block = False
            self.current_code_lang = None
            self.text.append('\n```\n')
        elif tag == 'code' and not self.in_code_block:
            # Inline code - handled in handle_data
            pass
        elif tag == 'table':
            self.in_table = False
            self.text.append('\n[/TABLE]\n\n')
        elif tag in ['p', 'div', 'br']:
            # Add line breaks for block elements
            if not self.in_code_block and not self.in_table:
                self.text.append('\n')
    
    def handle_data(self, data):
        # Preserve code block content as-is
        if self.in_code_block:
            self.text.append(data)
        else:
            # For regular text, just add it
            self.text.append(data)
    
    def get_text(self):
        """Get the extracted text"""
        result = ''.join(self.text)
        # Clean up excessive newlines
        result = re.sub(r'\n{3,}', '\n\n', result)
        return result.strip()


def strip_html_tags(html_content):
    """
    Strip HTML tags from content while preserving text structure.
    Preserves code blocks and tables in a readable format.
    
    Args:
        html_content: HTML string to strip
        
    Returns:
        Plain text with structure preserved
    """
    if not html_content:
        return ''
    
    # Use simple regex for basic stripping (faster for most cases)
    # This preserves code blocks and tables better
    text = html_content
    
    # Preserve code blocks - extract them first
    code_blocks = []
    code_pattern = r'<pre><code[^>]*class="[^"]*language-(\w+)[^"]*"[^>]*>(.*?)</code></pre>'
    
    def replace_code_block(match):
        lang = match.group(1)
        code = match.group(2)
        # Unescape HTML entities in code
        code = code.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
        code_blocks.append(f'\n```{lang}\n{code}\n```\n')
        return f'[CODE_BLOCK_{len(code_blocks)-1}]'
    
    text = re.sub(code_pattern, replace_code_block, text, flags=re.DOTALL)
    
    # Preserve tables - extract them first
    tables = []
    table_pattern = r'<table[^>]*>(.*?)</table>'
    
    def replace_table(match):
        table_html = match.group(1)
        # Extract table rows
        rows = []
        row_pattern = r'<tr[^>]*>(.*?)</tr>'
        for row_match in re.finditer(row_pattern, table_html, re.DOTALL):
            row_html = row_match.group(1)
            cells = []
            cell_pattern = r'<(th|td)[^>]*>(.*?)</\1>'
            for cell_match in re.finditer(cell_pattern, row_html, re.DOTALL):
                cell_text = cell_match.group(2)
                # Strip nested HTML from cell
                cell_text = re.sub(r'<[^>]+>', '', cell_text)
                cell_text = cell_text.strip()
                cells.append(cell_text)
            if cells:
                rows.append(' | '.join(cells))
        
        if rows:
            # Add separator after header row
            if len(rows) > 0:
                header_cells = len(rows[0].split(' | '))
                separator = ' | '.join(['---'] * header_cells)
                table_md = '\n'.join([rows[0], separator] + rows[1:])
            else:
                table_md = '\n'.join(rows)
            tables.append(f'\n{table_md}\n')
            return f'[TABLE_{len(tables)-1}]'
        return ''
    
    text = re.sub(table_pattern, replace_table, text, flags=re.DOTALL)
    
    # Strip all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Restore code blocks
    for i, code_block in enumerate(code_blocks):
        text = text.replace(f'[CODE_BLOCK_{i}]', code_block)
    
    # Restore tables
    for i, table in enumerate(tables):
        text = text.replace(f'[TABLE_{i}]', table)
    
    # Clean up HTML entities
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    
    # Clean up excessive whitespace
    text = re.sub(r'[ \t]+', ' ', text)  # Multiple spaces to single
    text = re.sub(r'\n{3,}', '\n\n', text)  # Multiple newlines to double
    
    return text.strip()

