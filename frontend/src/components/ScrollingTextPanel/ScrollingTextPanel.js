import React, { useRef, useEffect, useState } from 'react';
import animationData from '../../scrolling-panel-animation.json';
import './ScrollingTextPanel.css';

const ScrollingTextPanel = () => {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const getAnimationClass = (speed, direction) => {
    const speedClass = `scroll-${speed}`;
    const directionClass = direction === 'down' ? 'scroll-down' : 'scroll-up';
    return `${speedClass} ${directionClass}`;
  };

  const getTextSizeClass = (size) => {
    return `text-size-${size}`;
  };

  // Get all small and large text items to redistribute them
  const getSmallTextItems = () => {
    return animationData.content
      .map((item, index) => ({ ...item, originalIndex: index }))
      .filter(item => item.size === 'sm');
  };

  const getLargeTextItems = () => {
    return animationData.content
      .map((item, index) => ({ ...item, originalIndex: index }))
      .filter(item => item.size === 'lg');
  };

  const renderTextItems = (offset = 0) => {
    const smallTextItems = getSmallTextItems();
    const largeTextItems = getLargeTextItems();
    const smallTextMap = new Map();
    const largeTextMap = new Map();
    
    // Create maps of original indices to their positions in the text arrays
    smallTextItems.forEach((item, idx) => {
      smallTextMap.set(item.originalIndex, idx);
    });
    
    largeTextItems.forEach((item, idx) => {
      largeTextMap.set(item.originalIndex, idx);
    });

    return animationData.content.map((item, index) => {
      // Determine direction for different text sizes
      let direction = item.computedDirection;
      
      // For heading texts, alternate direction: some up, some down
      if (item.size === 'heading') {
        const headingIndex = index % 5; // There are 5 heading items
        // Alternate: first 3 go up, last 2 go down (or vice versa)
        direction = headingIndex < 3 ? 'up' : 'down';
      }
      // For lg text, make most transparent ones (opacity <= 0.11) move up
      else if (item.size === 'lg') {
        const largeTextIndex = largeTextMap.get(index);
        if (largeTextIndex !== undefined) {
          // Most transparent lg texts (opacity <= 0.11) move up, others alternate
          if (item.opacity <= 0.11) {
            direction = 'up';
          } else {
            // Alternate directions for less transparent ones
            direction = largeTextIndex % 2 === 0 ? 'up' : 'down';
          }
        }
      }
      
      const animationClass = getAnimationClass(item.computedSpeed, direction);
      const sizeClass = getTextSizeClass(item.size);
      
      // For small and large text, calculate width to allow wrapping into multiple lines
      // lg text needs to be wider to achieve 5+ lines
      const widthStyle = item.size === 'sm' 
        ? { maxWidth: '400px', minWidth: '250px', width: '400px' }
        : item.size === 'lg'
        ? { maxWidth: '700px', minWidth: '450px', width: '700px' }
        : { width: animationData.textSizes[item.size]?.width || 'auto' };
      
      // Reposition heading texts so parts are cut off/off-screen
      let leftPosition = item.x;
      if (item.size === 'heading' && containerWidth > 0) {
        // Position heading texts so they extend beyond the visible area
        // Some will start off-screen on the left (negative values)
        // Some will extend beyond the right edge
        const headingIndex = index % 5; // There are 5 heading items
        if (headingIndex === 0) {
          // First heading: start off-screen left, extend into view
          leftPosition = -200;
        } else if (headingIndex === 1) {
          // Second heading: start off-screen left
          leftPosition = -150;
        } else if (headingIndex === 2) {
          // Third heading: extend beyond right edge
          leftPosition = containerWidth - 300;
        } else if (headingIndex === 3) {
          // Fourth heading: start off-screen left
          leftPosition = -180;
        } else {
          // Fifth heading: extend beyond right edge
          leftPosition = containerWidth - 250;
        }
      } else if (item.size === 'lg' && containerWidth > 0) {
        const largeTextIndex = largeTextMap.get(index);
        const totalLargeItems = largeTextItems.length;
        
        // Distribute large text items evenly across the frame
        // Leave some padding on both sides (e.g., 5% margin on each side)
        const margin = containerWidth * 0.05;
        const textWidth = 700; // Fixed width of large text (increased for 5+ lines)
        const availableWidth = containerWidth - (margin * 2) - textWidth;
        
        // Distribute across the available width
        if (totalLargeItems > 1 && largeTextIndex !== undefined) {
          leftPosition = margin + (availableWidth / (totalLargeItems - 1)) * largeTextIndex;
        } else {
          leftPosition = margin;
        }
      } else if (item.size === 'sm' && containerWidth > 0) {
        const smallTextIndex = smallTextMap.get(index);
        const totalSmallItems = smallTextItems.length;
        
        // Distribute small text items evenly across the frame
        // Leave some padding on both sides (e.g., 5% margin on each side)
        const margin = containerWidth * 0.05;
        const textWidth = 400; // Fixed width of small text
        const availableWidth = containerWidth - (margin * 2) - textWidth;
        
        // Distribute across the available width
        if (totalSmallItems > 1 && smallTextIndex !== undefined) {
          leftPosition = margin + (availableWidth / (totalSmallItems - 1)) * smallTextIndex;
        } else {
          leftPosition = margin;
        }
      }
      
      return (
        <div
          key={`${index}-${offset}`}
          className={`scrolling-text-item ${animationClass} ${sizeClass}`}
          style={{
            position: 'absolute',
            left: `${leftPosition}px`,
            top: `${item.y + offset}px`,
            opacity: item.opacity,
            ...widthStyle,
          }}
        >
          {item.text}
        </div>
      );
    });
  };

  return (
    <div className="scrolling-panel-container" ref={containerRef}>
      <div className="scrolling-panel-gradient-top"></div>
      <div className="scrolling-panel-content">
        {renderTextItems(0)}
        {renderTextItems(animationData.meta.duplicateOffset)}
      </div>
      <div className="scrolling-panel-gradient-bottom"></div>
    </div>
  );
};

export default ScrollingTextPanel;

