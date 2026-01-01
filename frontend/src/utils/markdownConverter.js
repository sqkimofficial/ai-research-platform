import { marked } from 'marked';
import TurndownService from 'turndown';

// Helper to escape HTML in code blocks
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Configure marked for Markdown to HTML conversion
// marked v17+ uses a different renderer API with token objects
const renderer = {
  // Table rendering - receives token object with header and rows
  table(token) {
    let header = '';
    let body = '';
    
    // Build header
    if (token.header && token.header.length > 0) {
      const headerCells = token.header.map(cell => {
        const align = cell.align ? ` style="text-align: ${cell.align}"` : '';
        const content = this.parser.parseInline(cell.tokens);
        return `<th${align}>${content}</th>`;
      }).join('\n');
      header = `<thead>\n<tr>\n${headerCells}\n</tr>\n</thead>\n`;
    }
    
    // Build body
    if (token.rows && token.rows.length > 0) {
      const bodyRows = token.rows.map(row => {
        const cells = row.map((cell, i) => {
          const align = token.header[i]?.align ? ` style="text-align: ${token.header[i].align}"` : '';
          const content = this.parser.parseInline(cell.tokens);
          return `<td${align}>${content}</td>`;
        }).join('\n');
        return `<tr>\n${cells}\n</tr>`;
      }).join('\n');
      body = `<tbody>\n${bodyRows}\n</tbody>\n`;
    }
    
    return `<table class="tiptap-table">\n${header}${body}</table>\n`;
  },
  
  // Code block rendering - receives token object with text and lang
  code(token) {
    const code = token.text || '';
    const lang = token.lang || '';
    const langClass = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${langClass}>${escapeHtml(code)}</code></pre>\n`;
  },
};

marked.use({ renderer });

// Configure marked options
marked.setOptions({
  breaks: true,       // Convert \n to <br>
  gfm: true,          // GitHub Flavored Markdown (includes tables)
});

// Configure Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',           // Use # for headers
  codeBlockStyle: 'fenced',      // Use ``` for code blocks
  emDelimiter: '*',              // Use * for emphasis
  strongDelimiter: '**',         // Use ** for strong
  bulletListMarker: '-',         // Use - for unordered lists
});

// Add table support for Turndown
turndownService.addRule('table', {
  filter: 'table',
  replacement: function(content, node) {
    // Parse table structure
    const rows = [];
    const thead = node.querySelector('thead');
    const tbody = node.querySelector('tbody');
    
    // Process header rows
    if (thead) {
      const headerRows = thead.querySelectorAll('tr');
      headerRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('th, td')).map(cell => 
          cell.textContent.trim().replace(/\|/g, '\\|')
        );
        rows.push('| ' + cells.join(' | ') + ' |');
      });
      // Add separator row after headers
      if (headerRows.length > 0) {
        const headerCells = headerRows[0].querySelectorAll('th, td');
        const separator = Array.from(headerCells).map(() => '---').join(' | ');
        rows.push('| ' + separator + ' |');
      }
    }
    
    // Process body rows
    if (tbody) {
      const bodyRows = tbody.querySelectorAll('tr');
      bodyRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(cell => 
          cell.textContent.trim().replace(/\|/g, '\\|')
        );
        rows.push('| ' + cells.join(' | ') + ' |');
      });
    }
    
    // If no thead/tbody, process rows directly
    if (!thead && !tbody) {
      const allRows = node.querySelectorAll('tr');
      allRows.forEach((row, index) => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(cell => 
          cell.textContent.trim().replace(/\|/g, '\\|')
        );
        rows.push('| ' + cells.join(' | ') + ' |');
        
        // Add separator after first row (assumed to be header)
        if (index === 0) {
          const separator = Array.from(row.querySelectorAll('td, th')).map(() => '---').join(' | ');
          rows.push('| ' + separator + ' |');
        }
      });
    }
    
    return '\n\n' + rows.join('\n') + '\n\n';
  }
});

// Skip table cell and row elements (handled by table rule)
turndownService.addRule('tableCell', {
  filter: ['th', 'td'],
  replacement: function(content) {
    return content;
  }
});

turndownService.addRule('tableRow', {
  filter: 'tr',
  replacement: function(content) {
    return content;
  }
});

turndownService.addRule('tableSection', {
  filter: ['thead', 'tbody', 'tfoot'],
  replacement: function(content) {
    return content;
  }
});

// Preserve styled spans (custom fonts, colors, etc.)
turndownService.addRule('preserveStyledSpans', {
  filter: function (node) {
    return (
      node.nodeName === 'SPAN' &&
      node.hasAttribute('style') &&
      (node.style.fontFamily ||
        node.style.color ||
        node.style.fontSize ||
        node.style.backgroundColor)
    );
  },
  replacement: function (content, node) {
    const style = node.getAttribute('style');
    return `<span style="${style}">${content}</span>`;
  },
});

// Preserve styled paragraphs
turndownService.addRule('preserveStyledParagraphs', {
  filter: function (node) {
    return (
      node.nodeName === 'P' &&
      node.hasAttribute('style') &&
      (node.style.fontFamily ||
        node.style.color ||
        node.style.fontSize ||
        node.style.backgroundColor ||
        node.style.textAlign)
    );
  },
  replacement: function (content, node) {
    const style = node.getAttribute('style');
    return `\n\n<p style="${style}">${content}</p>\n\n`;
  },
});

// Preserve underline (Markdown doesn't have underline)
turndownService.addRule('preserveUnderline', {
  filter: ['u'],
  replacement: function (content) {
    return `<u>${content}</u>`;
  },
});

// Preserve strikethrough with HTML when needed
turndownService.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: function (content) {
    return `~~${content}~~`;
  },
});

// Preserve text color spans from TipTap
turndownService.addRule('preserveColorSpans', {
  filter: function (node) {
    if (node.nodeName !== 'SPAN') return false;
    const style = node.getAttribute('style') || '';
    return style.includes('color:') || style.includes('background-color:');
  },
  replacement: function (content, node) {
    const style = node.getAttribute('style');
    return `<span style="${style}">${content}</span>`;
  },
});

// Preserve mark/highlight elements from TipTap
turndownService.addRule('preserveHighlight', {
  filter: 'mark',
  replacement: function (content, node) {
    const style = node.getAttribute('style');
    const dataColor = node.getAttribute('data-color');
    if (style) {
      return `<mark style="${style}">${content}</mark>`;
    } else if (dataColor) {
      return `<mark data-color="${dataColor}">${content}</mark>`;
    }
    return `<mark>${content}</mark>`;
  },
});

// Handle code blocks properly
turndownService.addRule('codeBlock', {
  filter: function (node) {
    return node.nodeName === 'PRE' && node.querySelector('code');
  },
  replacement: function (content, node) {
    const codeElement = node.querySelector('code');
    const code = codeElement.textContent;
    const className = codeElement.getAttribute('class') || '';
    const langMatch = className.match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : '';
    return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  },
});

/**
 * Convert Markdown content to HTML for TipTap editor
 * @param {string} markdown - Markdown content (may contain embedded HTML)
 * @returns {string} - HTML content for TipTap
 */
export function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  // Ensure we're working with a string
  if (typeof markdown !== 'string') {
    console.error('markdownToHtml received non-string:', typeof markdown, markdown);
    return '';
  }
  
  try {
    // marked.parse handles embedded HTML automatically
    let html = marked.parse(markdown);
    
    // Ensure we got a string back
    if (typeof html !== 'string') {
      console.error('marked.parse returned non-string:', typeof html, html);
      return `<p>${escapeHtml(markdown)}</p>`;
    }
    
    // Ensure empty paragraphs aren't created for empty content
    if (html.trim() === '<p></p>') {
      return '';
    }
    
    return html;
  } catch (error) {
    console.error('Error converting Markdown to HTML:', error);
    // Return original content wrapped in paragraph if conversion fails
    return `<p>${escapeHtml(markdown)}</p>`;
  }
}

/**
 * Convert HTML content from TipTap to Markdown (preserving custom formatting)
 * @param {string} html - HTML content from TipTap editor
 * @returns {string} - Markdown content with preserved HTML for custom formatting
 */
export function htmlToMarkdown(html) {
  if (!html) return '';
  
  // Ensure we're working with a string
  if (typeof html !== 'string') {
    console.error('htmlToMarkdown received non-string:', typeof html, html);
    return '';
  }
  
  try {
    // Clean up TipTap's empty paragraph markers
    let cleanedHtml = html
      .replace(/<p><br><\/p>/g, '\n\n')
      .replace(/<p><br\/><\/p>/g, '\n\n')
      .replace(/<p><br class="ProseMirror-trailingBreak"><\/p>/g, '\n\n')
      .replace(/<br>/g, '\n')
      .replace(/<br\/>/g, '\n')
      .replace(/<br class="ProseMirror-trailingBreak">/g, '');
    
    const markdown = turndownService.turndown(cleanedHtml);
    
    // Clean up excessive newlines
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    // Return HTML as-is if conversion fails
    return html;
  }
}

/**
 * Check if content is pure Markdown or contains HTML
 * @param {string} content - Content to check
 * @returns {boolean} - True if content contains HTML tags
 */
export function containsHtml(content) {
  if (!content) return false;
  // Check for common HTML tags
  const htmlPattern = /<[^>]+>/;
  return htmlPattern.test(content);
}

const markdownConverter = {
  markdownToHtml,
  htmlToMarkdown,
  containsHtml,
};

export default markdownConverter;
