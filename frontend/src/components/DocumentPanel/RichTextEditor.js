import React, { useImperativeHandle, forwardRef, useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontFamily } from '@tiptap/extension-font-family';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Extension } from '@tiptap/core';
import { common, createLowlight } from 'lowlight';
import './RichTextEditor.css';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// Custom FontSize extension
const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize: (fontSize) => ({ commands }) => {
        return commands.setMark('textStyle', { fontSize });
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .removeEmptyTextStyle()
          .run();
      },
    };
  },
});

// Menu Bar Component
const MenuBar = ({ editor }) => {
  if (!editor) return null;

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const fontSizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px'];

  return (
    <div className="tiptap-toolbar">
      {/* Text Formatting */}
      <div className="toolbar-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'is-active' : ''}
          title="Underline"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'is-active' : ''}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
      </div>

      {/* Headers */}
      <div className="toolbar-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
          title="Heading 1"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
          title="Heading 3"
        >
          H3
        </button>
      </div>

      {/* Font Family */}
      <div className="toolbar-group">
        <select
          onChange={(e) => {
            if (e.target.value === '') {
              editor.chain().focus().unsetFontFamily().run();
            } else {
              editor.chain().focus().setFontFamily(e.target.value).run();
            }
          }}
          value={editor.getAttributes('textStyle').fontFamily || ''}
          title="Font Family"
        >
          <option value="">Default</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Times New Roman, serif">Times New Roman</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Verdana, sans-serif">Verdana</option>
          <option value="Courier New, monospace">Courier New</option>
          <option value="Trebuchet MS, sans-serif">Trebuchet MS</option>
        </select>
      </div>

      {/* Font Size */}
      <div className="toolbar-group">
        <select
          onChange={(e) => {
            if (e.target.value === '') {
              editor.chain().focus().unsetFontSize().run();
            } else {
              editor.chain().focus().setFontSize(e.target.value).run();
            }
          }}
          value={editor.getAttributes('textStyle').fontSize || ''}
          title="Font Size"
          className="font-size-select"
        >
          <option value="">Size</option>
          {fontSizes.map(size => (
            <option key={size} value={size}>{parseInt(size)}px</option>
          ))}
        </select>
      </div>

      {/* Text Color */}
      <div className="toolbar-group">
        <input
          type="color"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          value={editor.getAttributes('textStyle').color || '#000000'}
          title="Text Color"
          className="color-picker"
        />
        <input
          type="color"
          onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
          value={editor.getAttributes('highlight').color || '#ffff00'}
          title="Highlight Color"
          className="color-picker highlight-picker"
        />
      </div>

      {/* Lists */}
      <div className="toolbar-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
          title="Bullet List"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
          title="Numbered List"
        >
          1.
        </button>
      </div>

      {/* Alignment */}
      <div className="toolbar-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}
          title="Align Left"
        >
          ≡
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}
          title="Align Center"
        >
          ≡
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}
          title="Align Right"
        >
          ≡
        </button>
      </div>

      {/* Block Elements */}
      <div className="toolbar-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'is-active' : ''}
          title="Quote"
        >
          "
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor.isActive('codeBlock') ? 'is-active' : ''}
          title="Code Block"
        >
          {'</>'}
        </button>
      </div>

      {/* Table */}
      <div className="toolbar-group">
        <button type="button" onClick={addTable} title="Insert Table">
          ⊞
        </button>
        {editor.isActive('table') && (
          <>
            <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add Column Before">
              ⇤+
            </button>
            <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add Column After">
              +⇥
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete Column">
              ⊟C
            </button>
            <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()} title="Add Row Before">
              ↑+
            </button>
            <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} title="Add Row After">
              +↓
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} title="Delete Row">
              ⊟R
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} title="Delete Table">
              🗑
            </button>
          </>
        )}
      </div>

      {/* Utilities */}
      <div className="toolbar-group">
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
          ―
        </button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().run()} title="Clear Formatting">
          ✕
        </button>
      </div>
    </div>
  );
};

const RichTextEditor = forwardRef(({
  value,
  onChange,
  onSave,
  placeholder = 'Start writing your research document...',
  readOnly = false,
}, ref) => {
  // Track if we're currently updating from external source
  const isExternalUpdate = useRef(false);
  // Track the last value we set externally
  const lastExternalValue = useRef(value);
  // Track the saved cursor position (persists when user clicks outside document)
  // This enables Google Docs-like behavior where cursor position is remembered
  const savedSelectionRef = useRef(null);
  
  // Track editor focus state for ghost cursor display
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  // Track ghost cursor position (DOM coordinates) for visual indicator
  const [ghostCursorPosition, setGhostCursorPosition] = useState(null);
  // Ref to the editor container for positioning calculations
  const editorContainerRef = useRef(null);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We use CodeBlockLowlight instead
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'tiptap-table',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'code-block',
        },
      }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({
        multicolor: true,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      FontFamily,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      // Don't trigger onChange if we're updating from external source
      if (isExternalUpdate.current) {
        return;
      }
      if (onChange) {
        const html = editor.getHTML();
        onChange(html);
      }
    },
    // Save cursor position when editor loses focus (Google Docs-like behavior)
    onBlur: ({ editor }) => {
      // Save the selection state when editor loses focus
      // This allows us to insert content at the last cursor position
      // even when user clicks in a different panel (like chat)
      savedSelectionRef.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
        anchor: editor.state.selection.anchor,
      };
      
      setIsEditorFocused(false);
      
      // Calculate the DOM coordinates of the cursor for the ghost cursor indicator
      try {
        const { from } = editor.state.selection;
        const coords = editor.view.coordsAtPos(from);
        
        if (coords && editorContainerRef.current) {
          // Find the content wrapper which contains the ghost cursor
          const contentWrapper = editorContainerRef.current.querySelector('.tiptap-editor-content-wrapper');
          const wrapperRect = contentWrapper ? contentWrapper.getBoundingClientRect() : editorContainerRef.current.getBoundingClientRect();
          
          // Find the scrollable editor content element
          const editorContent = editorContainerRef.current.querySelector('.tiptap-editor-content');
          const scrollTop = editorContent ? editorContent.scrollTop : 0;
          const scrollLeft = editorContent ? editorContent.scrollLeft : 0;
          
          // Calculate position relative to the content wrapper, accounting for scroll
          setGhostCursorPosition({
            top: coords.top - wrapperRect.top + scrollTop,
            left: coords.left - wrapperRect.left + scrollLeft,
            height: coords.bottom - coords.top || 20, // Default height if not available
          });
        }
      } catch (e) {
        // If we can't get coordinates, just don't show ghost cursor
        console.warn('Could not calculate ghost cursor position:', e);
        setGhostCursorPosition(null);
      }
    },
    // Clear ghost cursor when editor gains focus
    onFocus: () => {
      setIsEditorFocused(true);
      setGhostCursorPosition(null);
    },
  });

  // Update content when value prop changes from external source
  useEffect(() => {
    if (!editor) return;
    
    // Skip if value hasn't actually changed
    if (value === lastExternalValue.current) return;
    
    // Skip if value is undefined
    if (value === undefined) return;
    
    const currentHTML = editor.getHTML();
    
    // Normalize both values for comparison
    const normalizedValue = (value || '').trim();
    const normalizedCurrent = (currentHTML || '').trim();
    
    // Check if they're effectively the same
    if (normalizedValue === normalizedCurrent) {
      lastExternalValue.current = value;
      return;
    }
    
    // Check if both are effectively empty
    const isValueEmpty = !normalizedValue || normalizedValue === '<p></p>';
    const isCurrentEmpty = !normalizedCurrent || normalizedCurrent === '<p></p>';
    
    if (isValueEmpty && isCurrentEmpty) {
      lastExternalValue.current = value;
      return;
    }
    
    // Set flag to prevent onChange from firing during external update
    isExternalUpdate.current = true;
    lastExternalValue.current = value;
    
    // Update the editor content
    editor.commands.setContent(value || '', false);
    
    // Reset flag after a tick
    setTimeout(() => {
      isExternalUpdate.current = false;
    }, 0);
    
  }, [value, editor]);

  // Update editable state when readOnly prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    undo: () => {
      if (editor) {
        editor.chain().focus().undo().run();
      }
    },
    redo: () => {
      if (editor) {
        editor.chain().focus().redo().run();
      }
    },
    getEditor: () => editor,
    focus: () => {
      if (editor) {
        editor.chain().focus().run();
      }
    },
    // Get the saved cursor position (null if user never clicked in document)
    getSavedCursorPosition: () => savedSelectionRef.current,
    
    // Check if there's a saved cursor position
    hasSavedCursorPosition: () => savedSelectionRef.current !== null,
    
    // Insert content at the saved cursor position, or at end if no position saved
    // This enables Google Docs-like behavior where clicking "Insert" in chat
    // places content at the last known cursor position in the document
    insertAtCursor: (htmlContent) => {
      if (!editor) return false;
      
      if (savedSelectionRef.current) {
        // Restore selection and insert at that position
        editor
          .chain()
          .focus()
          .setTextSelection(savedSelectionRef.current.from)
          .insertContent(htmlContent)
          .run();
      } else {
        // No saved position - append to end of document
        const endPosition = editor.state.doc.content.size;
        editor
          .chain()
          .focus()
          .setTextSelection(endPosition)
          .insertContent(htmlContent)
          .run();
      }
      return true;
    },
    
    // Clear the saved cursor position (useful for edge cases)
    clearSavedPosition: () => {
      savedSelectionRef.current = null;
    },
    
    // Get the current HTML content
    getHTML: () => {
      if (editor) {
        return editor.getHTML();
      }
      return '';
    },
  }));

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (onSave) {
          onSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  return (
    <div className="rich-text-editor-container">
      <MenuBar editor={editor} />
      <div 
        ref={editorContainerRef} 
        className={`tiptap-editor-wrapper ${!isEditorFocused && ghostCursorPosition ? 'has-ghost-cursor' : ''}`}
      >
        <div className="tiptap-editor-content-wrapper" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <EditorContent editor={editor} className="tiptap-editor-content" />
          {/* Ghost cursor indicator - shows where cursor was when user clicked outside */}
          {/* This mimics Google Docs behavior: thicker, non-blinking line at last cursor position */}
          {!isEditorFocused && ghostCursorPosition && (
            <div 
              className="ghost-cursor-indicator"
              style={{
                position: 'absolute',
                top: `${ghostCursorPosition.top}px`,
                left: `${ghostCursorPosition.left}px`,
                height: `${ghostCursorPosition.height}px`,
                width: '2px',
                backgroundColor: 'rgba(0, 50, 98, 0.8)',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
