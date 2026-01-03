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

// Import icons - all in document-menu-icons folder directly
import { ReactComponent as UndoIcon } from '../../assets/document-menu-icons/Arrow_Undo_Up_Left.svg';
import { ReactComponent as RedoIcon } from '../../assets/document-menu-icons/Arrow_Undo_Up_Right.svg';
import { ReactComponent as BoldIcon } from '../../assets/document-menu-icons/Bold.svg';
import { ReactComponent as UnderlineIcon } from '../../assets/document-menu-icons/Underline.svg';
import { ReactComponent as StrikethroughIcon } from '../../assets/document-menu-icons/Strikethrough.svg';
import { ReactComponent as OrderedListIcon } from '../../assets/document-menu-icons/List_Ordered.svg';
import { ReactComponent as ChecklistIcon } from '../../assets/document-menu-icons/List_Checklist.svg';
import { ReactComponent as AlignLeftIcon } from '../../assets/document-menu-icons/Text_Align_Left.svg';
import { ReactComponent as AlignRightIcon } from '../../assets/document-menu-icons/Text_Align_Right.svg';
import { ReactComponent as AlignCenterIcon } from '../../assets/document-menu-icons/text-align-center.svg';
import { ReactComponent as MoreIcon } from '../../assets/document-menu-icons/More_Horizontal.svg';
import { ReactComponent as MenuIcon } from '../../assets/menu-icon.svg';
import { ReactComponent as PlusIconSvg } from '../../assets/document-menu-icons/plus-icon.svg';
import { ReactComponent as MinusIconSvg } from '../../assets/document-menu-icons/minus-icon.svg';
import { ReactComponent as HeadingH1IconSvg } from '../../assets/document-menu-icons/Heading_H1.svg';
import { ReactComponent as HeadingH2IconSvg } from '../../assets/document-menu-icons/Heading_H2.svg';
import { ReactComponent as HeadingH3IconSvg } from '../../assets/document-menu-icons/Heading_H3.svg';
import { ReactComponent as HeadingH4IconSvg } from '../../assets/document-menu-icons/Heading_H4.svg';
import { ReactComponent as HeadingH5IconSvg } from '../../assets/document-menu-icons/Heading_H5.svg';
import { ReactComponent as HeadingH6IconSvg } from '../../assets/document-menu-icons/Heading_H6.svg';
import { ReactComponent as ParagraphIconSvg } from '../../assets/document-menu-icons/Paragraph.svg';
import { ReactComponent as CloudSavedIcon } from '../../assets/document-menu-icons/cloud-saved.svg';
import { ReactComponent as HighlightIcon } from '../../assets/document-menu-icons/highlight.svg';

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

// Heading Icons
const HeadingH1Icon = ({ className }) => <HeadingH1IconSvg className={className} />;
const HeadingH2Icon = ({ className }) => <HeadingH2IconSvg className={className} />;
const HeadingH3Icon = ({ className }) => <HeadingH3IconSvg className={className} />;
const HeadingH4Icon = ({ className }) => <HeadingH4IconSvg className={className} />;
const HeadingH5Icon = ({ className }) => <HeadingH5IconSvg className={className} />;
const HeadingH6Icon = ({ className }) => <HeadingH6IconSvg className={className} />;
const ParagraphIcon = ({ className }) => <ParagraphIconSvg className={className} />;

// Plus Icon Component
const PlusIcon = ({ className }) => (
  <PlusIconSvg className={className} />
);

// Minus Icon Component
const MinusIcon = ({ className }) => (
  <MinusIconSvg className={className} />
);



// Menu Bar Component
const MenuBar = ({ editor, onUndo, onRedo, documentName, onDocumentNameClick, isEditingDocumentName, editingDocumentName, onDocumentNameChange, onDocumentNameBlur, onDocumentNameKeyPress, saveStatus, onReferencesClick, onMenuClick }) => {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isHeadingDropdownOpen, setIsHeadingDropdownOpen] = useState(false);
  const [fontSizeValue, setFontSizeValue] = useState('');
  const [moreMenuStyle, setMoreMenuStyle] = useState({});
  const moreMenuRef = useRef(null);
  const moreMenuButtonRef = useRef(null);
  const headingDropdownRef = useRef(null);

  useEffect(() => {
    if (!editor) return;
    const currentSize = editor.getAttributes('textStyle').fontSize || '';
    setFontSizeValue(currentSize ? parseInt(currentSize) : '');
  }, [editor?.state.selection]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setIsMoreMenuOpen(false);
      }
      if (headingDropdownRef.current && !headingDropdownRef.current.contains(event.target)) {
        setIsHeadingDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate more menu position to avoid chat window and center-align
  useEffect(() => {
    if (isMoreMenuOpen && moreMenuButtonRef.current && moreMenuRef.current) {
      const buttonRect = moreMenuButtonRef.current.getBoundingClientRect();
      const menuWidth = moreMenuRef.current.offsetWidth || 400; // Approximate width
      const viewportWidth = window.innerWidth;
      
      // Center the menu relative to the button
      const buttonCenter = buttonRect.left + (buttonRect.width / 2);
      const menuLeft = buttonCenter - (menuWidth / 2);
      const menuRight = buttonCenter + (menuWidth / 2);
      
      // Check if menu would go off the left edge
      if (menuLeft < 0) {
        setMoreMenuStyle({
          left: '0',
          right: 'auto',
          transform: 'none'
        });
      }
      // Check if menu would go off the right edge (into chat window)
      else if (menuRight > viewportWidth) {
        const rightPosition = viewportWidth - buttonRect.right;
        setMoreMenuStyle({
          left: 'auto',
          right: `${rightPosition}px`,
          transform: 'none'
        });
      } else {
        // Center align
        setMoreMenuStyle({
          left: '50%',
          right: 'auto',
          transform: 'translateX(-50%)'
        });
      }
    }
  }, [isMoreMenuOpen]);

  if (!editor) return null;

  const fontSizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px'];
  const fontFamilies = [
    { value: '', label: 'Default' },
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Times New Roman, serif', label: 'Times New Roman' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: 'Verdana, sans-serif', label: 'Verdana' },
    { value: 'Courier New, monospace', label: 'Courier New' },
    { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' }
  ];

  const currentHeading = editor.isActive('heading', { level: 1 }) ? 'H1' :
                         editor.isActive('heading', { level: 2 }) ? 'H2' :
                         editor.isActive('heading', { level: 3 }) ? 'H3' : 'Paragraph';

  const handleFontSizeChange = (delta) => {
    const currentSize = editor.getAttributes('textStyle').fontSize || '12px';
    const currentNum = parseInt(currentSize) || 12;
    const newSize = Math.max(8, Math.min(72, currentNum + delta));
    const newSizeStr = `${newSize}px`;
    editor.chain().focus().setFontSize(newSizeStr).run();
    setFontSizeValue(newSize);
  };

  const handleFontSizeInputChange = (e) => {
    const value = e.target.value;
    if (value === '') {
      setFontSizeValue('');
      editor.chain().focus().unsetFontSize().run();
    } else {
      const num = parseInt(value);
      if (!isNaN(num) && num >= 8 && num <= 72) {
        setFontSizeValue(num);
        editor.chain().focus().setFontSize(`${num}px`).run();
      }
    }
  };

  const handleFontSizeBlur = () => {
    if (fontSizeValue === '') {
      const currentSize = editor.getAttributes('textStyle').fontSize || '12px';
      setFontSizeValue(parseInt(currentSize) || 12);
    }
  };

  return (
    <div className="tiptap-toolbar-new">
      <div className="toolbar-left">
        {/* Document Name */}
        {isEditingDocumentName ? (
          <input
            type="text"
            value={editingDocumentName}
            onChange={onDocumentNameChange}
            onBlur={onDocumentNameBlur}
            onKeyDown={onDocumentNameKeyPress}
            className="document-name-input"
            autoFocus
            maxLength={200}
          />
        ) : (
          <div 
            className="document-name-display"
            onClick={onDocumentNameClick}
            title="Click to edit document name"
          >
            {documentName || 'Untitled Document'}
          </div>
        )}
        
        {/* Save Status - Cloud Saved Icon */}
        {saveStatus === 'saved' && (
          <CloudSavedIcon className="toolbar-icon" />
        )}
        {saveStatus === 'saving' && (
          <span className="save-spinner"></span>
        )}
        {saveStatus === 'error' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        )}
        <div className="toolbar-divider" />
        
        {/* Undo/Redo */}
        <button
          type="button"
          onClick={onUndo}
          className="toolbar-icon-btn"
          title="Undo"
        >
          <UndoIcon className="toolbar-icon" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          className="toolbar-icon-btn"
          title="Redo"
        >
          <RedoIcon className="toolbar-icon" />
        </button>
        <div className="toolbar-divider" />
        
        {/* Heading Dropdown */}
        <div className="toolbar-dropdown-wrapper" ref={headingDropdownRef}>
          <button
            type="button"
            onClick={() => setIsHeadingDropdownOpen(!isHeadingDropdownOpen)}
            className="toolbar-dropdown-btn"
            title="Heading"
          >
            <HeadingH1Icon className="toolbar-icon" />
          </button>
          {isHeadingDropdownOpen && (
            <div className="toolbar-dropdown-menu">
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setParagraph().run();
                  setIsHeadingDropdownOpen(false);
                }}
                className={!editor.isActive('heading') ? 'active' : ''}
              >
                <ParagraphIcon className="toolbar-icon-small" />
                <span>Paragraph</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 1 }).run();
                  setIsHeadingDropdownOpen(false);
                }}
                className={editor.isActive('heading', { level: 1 }) ? 'active' : ''}
              >
                <HeadingH1Icon className="toolbar-icon-small" />
                <span>Heading 1</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 2 }).run();
                  setIsHeadingDropdownOpen(false);
                }}
                className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
              >
                <HeadingH2Icon className="toolbar-icon-small" />
                <span>Heading 2</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 3 }).run();
                  setIsHeadingDropdownOpen(false);
                }}
                className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}
              >
                <HeadingH3Icon className="toolbar-icon-small" />
                <span>Heading 3</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 4 }).run();
                  setIsHeadingDropdownOpen(false);
                }}
                className={editor.isActive('heading', { level: 4 }) ? 'active' : ''}
              >
                <HeadingH4Icon className="toolbar-icon-small" />
                <span>Heading 4</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 5 }).run();
                  setIsHeadingDropdownOpen(false);
                }}
                className={editor.isActive('heading', { level: 5 }) ? 'active' : ''}
              >
                <HeadingH5Icon className="toolbar-icon-small" />
                <span>Heading 5</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 6 }).run();
                  setIsHeadingDropdownOpen(false);
                }}
                className={editor.isActive('heading', { level: 6 }) ? 'active' : ''}
              >
                <HeadingH6Icon className="toolbar-icon-small" />
                <span>Heading 6</span>
              </button>
            </div>
          )}
        </div>
        <div className="toolbar-divider" />
        
        {/* Font Family */}
        <div className="toolbar-dropdown-wrapper">
          <select
            onChange={(e) => {
              if (e.target.value === '') {
                editor.chain().focus().unsetFontFamily().run();
              } else {
                editor.chain().focus().setFontFamily(e.target.value).run();
              }
            }}
            value={editor.getAttributes('textStyle').fontFamily || ''}
            className="toolbar-select"
            title="Font Family"
          >
            {fontFamilies.map(font => (
              <option key={font.value} value={font.value}>{font.label}</option>
            ))}
          </select>
        </div>
        <div className="toolbar-divider" />
        
        {/* Font Size with Plus/Minus */}
        <div className="toolbar-font-size">
          <button
            type="button"
            onClick={() => handleFontSizeChange(-1)}
            className="toolbar-icon-btn"
            title="Decrease Font Size"
          >
            <MinusIcon className="toolbar-icon" />
          </button>
          <input
            type="text"
            value={fontSizeValue}
            onChange={handleFontSizeInputChange}
            onBlur={handleFontSizeBlur}
            className="toolbar-font-size-input"
            placeholder="12"
          />
          <button
            type="button"
            onClick={() => handleFontSizeChange(1)}
            className="toolbar-icon-btn"
            title="Increase Font Size"
          >
            <PlusIcon className="toolbar-icon" />
          </button>
        </div>
        <div className="toolbar-divider" />
        
        {/* More Menu */}
        <div className="toolbar-dropdown-wrapper" ref={moreMenuRef}>
          <button
            ref={moreMenuButtonRef}
            type="button"
            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            className="toolbar-icon-btn"
            title="More Options"
          >
            <MoreIcon className="toolbar-icon" />
          </button>
          {isMoreMenuOpen && (
            <div className="toolbar-more-menu" style={moreMenuStyle}>
              <div className="more-menu-group">
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`more-menu-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
                  title="Bold"
                >
                  <BoldIcon className="toolbar-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  className={`more-menu-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
                  title="Underline"
                >
                  <UnderlineIcon className="toolbar-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  className={`more-menu-btn ${editor.isActive('strike') ? 'is-active' : ''}`}
                  title="Strikethrough"
                >
                  <StrikethroughIcon className="toolbar-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  className={`more-menu-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`}
                  title="Ordered List"
                >
                  <OrderedListIcon className="toolbar-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  className={`more-menu-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`}
                  title="Checklist"
                >
                  <ChecklistIcon className="toolbar-icon" />
                </button>
              </div>
              <div className="toolbar-divider" />
              <div className="more-menu-group">
                <button
                  type="button"
                  onClick={() => editor.chain().focus().setTextAlign('left').run()}
                  className={`more-menu-btn ${editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`}
                  title="Align Left"
                >
                  <AlignLeftIcon className="toolbar-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().setTextAlign('right').run()}
                  className={`more-menu-btn ${editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`}
                  title="Align Right"
                >
                  <AlignRightIcon className="toolbar-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().setTextAlign('center').run()}
                  className={`more-menu-btn ${editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`}
                  title="Center"
                >
                  <AlignCenterIcon className="toolbar-icon" />
                </button>
              </div>
              <div className="toolbar-divider" />
              <div className="more-menu-group">
                <div className="color-picker-wrapper">
                  <input
                    type="color"
                    onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                    value={editor.getAttributes('textStyle').color || '#000000'}
                    className="color-picker-input"
                    title="Text Color"
                    id="text-color-picker"
                  />
                  <label htmlFor="text-color-picker" className="color-picker-display" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }} />
                </div>
                <div className="color-picker-wrapper">
                  <input
                    type="color"
                    onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
                    value={editor.getAttributes('highlight')?.color || '#ffff00'}
                    className="color-picker-input"
                    title="Highlight Color"
                    id="highlight-color-picker"
                  />
                  <label htmlFor="highlight-color-picker" className="toolbar-icon-btn" title="Highlight Color">
                    <HighlightIcon className="toolbar-icon" />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="toolbar-right">
        <button 
          type="button" 
          className="toolbar-references-btn"
          onClick={onReferencesClick}
        >
          References
        </button>
        <button
          type="button"
          className="toolbar-menu-btn"
          onClick={onMenuClick}
          title="Menu"
        >
          <MenuIcon className="toolbar-icon" />
        </button>
      </div>
    </div>
  );
};

const RichTextEditor = forwardRef(({
  value,
  onChange,
  onSave,
  placeholder = '',
  readOnly = false,
  documentName,
  onDocumentNameClick,
  isEditingDocumentName,
  editingDocumentName,
  onDocumentNameChange,
  onDocumentNameBlur,
  onDocumentNameKeyPress,
  saveStatus,
  onReferencesClick,
  onMenuClick,
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
          levels: [1, 2, 3, 4, 5, 6],
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
        defaultAlignment: 'left',
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

  const handleUndo = () => {
    if (editor) {
      editor.chain().focus().undo().run();
    }
  };

  const handleRedo = () => {
    if (editor) {
      editor.chain().focus().redo().run();
    }
  };

  return (
    <div className="rich-text-editor-container">
      <MenuBar 
        editor={editor} 
        onUndo={handleUndo} 
        onRedo={handleRedo}
        documentName={documentName}
        onDocumentNameClick={onDocumentNameClick}
        isEditingDocumentName={isEditingDocumentName}
        editingDocumentName={editingDocumentName}
        onDocumentNameChange={onDocumentNameChange}
        onDocumentNameBlur={onDocumentNameBlur}
        onDocumentNameKeyPress={onDocumentNameKeyPress}
        saveStatus={saveStatus}
        onReferencesClick={onReferencesClick}
        onMenuClick={onMenuClick}
      />
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
