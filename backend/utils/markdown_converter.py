"""
Utility for converting Markdown to HTML (one-way conversion for AI output).
Uses markdown library if available, otherwise falls back to basic conversion.
"""
import re

try:
    import markdown
    MARKDOWN_AVAILABLE = True
except ImportError:
    MARKDOWN_AVAILABLE = False


def markdown_to_html(markdown_content):
    """
    Convert Markdown content to HTML.
    This is a one-way conversion used when inserting AI-generated Markdown content.
    
    Args:
        markdown_content: Markdown string to convert
        
    Returns:
        HTML string
    """
    if not markdown_content:
        return ''
    
    if MARKDOWN_AVAILABLE:
        # Use markdown library for proper conversion
        md = markdown.Markdown(extensions=['tables', 'fenced_code', 'codehilite'])
        html = md.convert(markdown_content)
        return html
    else:
        # Fallback: basic conversion (not as robust but works for common cases)
        html = markdown_content
        
        # Headers
        html = re.sub(r'^### (.*?)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
        html = re.sub(r'^## (.*?)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
        html = re.sub(r'^# (.*?)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)
        
        # Bold
        html = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', html)
        html = re.sub(r'__([^_]+)__', r'<strong>\1</strong>', html)
        
        # Italic
        html = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', html)
        html = re.sub(r'(?<!_)_([^_]+)_(?!_)', r'<em>\1</em>', html)
        
        # Code blocks
        html = re.sub(
            r'```(\w+)?\n(.*?)```',
            lambda m: f'<pre><code class="language-{m.group(1) or ""}">{_escape_html(m.group(2))}</code></pre>',
            html,
            flags=re.DOTALL
        )
        
        # Inline code
        html = re.sub(r'`([^`]+)`', r'<code>\1</code>', html)
        
        # Tables (basic support)
        lines = html.split('\n')
        in_table = False
        result_lines = []
        
        for line in lines:
            if '|' in line and line.strip().startswith('|'):
                if not in_table:
                    result_lines.append('<table class="tiptap-table">')
                    result_lines.append('<thead>')
                    in_table = True
                    is_header = True
                
                cells = [cell.strip() for cell in line.split('|')[1:-1]]
                if '---' in line:
                    result_lines.append('</thead>')
                    result_lines.append('<tbody>')
                    is_header = False
                else:
                    tag = 'th' if is_header else 'td'
                    cell_html = f'<tr>{"".join([f"<{tag}>{_escape_html(cell)}</{tag}>" for cell in cells])}</tr>'
                    result_lines.append(cell_html)
            else:
                if in_table:
                    result_lines.append('</tbody>')
                    result_lines.append('</table>')
                    in_table = False
                result_lines.append(line)
        
        if in_table:
            result_lines.append('</tbody>')
            result_lines.append('</table>')
        
        html = '\n'.join(result_lines)
        
        # Paragraphs (wrap consecutive lines)
        html = re.sub(r'\n\n+', '</p><p>', html)
        html = f'<p>{html}</p>'
        
        return html


def _escape_html(text):
    """Escape HTML special characters"""
    if not text:
        return ''
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    text = text.replace('"', '&quot;')
    text = text.replace("'", '&#39;')
    return text

