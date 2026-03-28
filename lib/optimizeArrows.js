/**
 * Optimize Excalidraw arrow coordinates by aligning them to the center of bound element edges
 */

import { safeParseJsonWithRepair } from './json-repair.js';

const LAYOUT_GAP = 48;
const CHAR_WIDTH_RATIO = 0.58;
const LINE_HEIGHT_RATIO = 1.35;
const LAYOUT_NODE_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'image']);
import { applyLayoutEngine } from './layoutEngine.js';

function asFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function getContainerText(element) {
  const labelText = typeof element.label?.text === 'string' ? element.label.text.trim() : '';
  const looseText = typeof element.text === 'string' ? element.text.trim() : '';

  if (labelText && looseText && labelText !== looseText) {
    return `${labelText}\n${looseText}`;
  }

  return labelText || looseText;
}

function wrapLine(line, maxChars) {
  if (!line) return [''];
  if (line.length <= maxChars) return [line];

  const wrapped = [];
  let remaining = line;

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(' ', maxChars);
    if (splitAt < Math.floor(maxChars * 0.6)) {
      splitAt = maxChars;
    }
    wrapped.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  wrapped.push(remaining);
  return wrapped.filter(Boolean);
}

function getWrappedLines(text, maxCharsPerLine) {
  return text
    .split(/\r?\n/)
    .flatMap((line) => wrapLine(line.trim(), maxCharsPerLine))
    .filter((line) => line.length > 0);
}

function normalizeContainerLabel(element) {
  if (!['rectangle', 'ellipse', 'diamond'].includes(element.type)) {
    return element;
  }

  const text = getContainerText(element);
  if (!text) return element;

  const fontSize = asFiniteNumber(element.label?.fontSize, 18);
  const minWidth = element.type === 'diamond' ? 240 : 220;
  const maxWidth = element.type === 'diamond' ? 420 : 480;
  const paddingX = element.type === 'diamond' ? 52 : 28;
  const paddingY = element.type === 'diamond' ? 42 : 24;
  const charWidth = fontSize * CHAR_WIDTH_RATIO;
  const longestLineLength = Math.max(
    ...text.split(/\r?\n/).map((line) => line.trim().length),
    0
  );

  let width = Math.max(asFiniteNumber(element.width, 0), minWidth);
  const contentWidth = Math.ceil(longestLineLength * charWidth + paddingX * 2);
  width = Math.max(width, Math.min(contentWidth, maxWidth));

  const maxCharsPerLine = Math.max(10, Math.floor((width - paddingX * 2) / charWidth));
  const wrappedLines = getWrappedLines(text, maxCharsPerLine);
  const lineCount = Math.max(wrappedLines.length, 1);
  const contentHeight = Math.ceil(lineCount * fontSize * LINE_HEIGHT_RATIO + paddingY * 2);

  let height = Math.max(asFiniteNumber(element.height, 0), contentHeight);
  if (element.type === 'diamond') {
    height = Math.ceil(height * 1.15);
  }

  const normalized = {
    ...element,
    width,
    height,
    label: {
      ...(element.label || {}),
      text,
    },
  };

  delete normalized.text;
  return normalized;
}

function getElementBounds(element) {
  const x = asFiniteNumber(element.x, 0);
  const y = asFiniteNumber(element.y, 0);

  if (element.type === 'text') {
    const text = typeof element.text === 'string' ? element.text : '';
    const fontSize = asFiniteNumber(element.fontSize, 20);
    const charWidth = fontSize * CHAR_WIDTH_RATIO;
    const wrappedLines = getWrappedLines(text, 24);
    const longestLineLength = Math.max(...wrappedLines.map((line) => line.length), 0);
    const width = Math.max(asFiniteNumber(element.width, 0), Math.ceil(longestLineLength * charWidth));
    const height = Math.max(
      asFiniteNumber(element.height, 0),
      Math.ceil(Math.max(wrappedLines.length, 1) * fontSize * LINE_HEIGHT_RATIO)
    );
    return { left: x, top: y, right: x + width, bottom: y + height };
  }

  const width = asFiniteNumber(element.width, 200);
  const height = asFiniteNumber(element.height, 80);
  return { left: x, top: y, right: x + width, bottom: y + height };
}

function shiftElement(element, dx, dy) {
  return {
    ...element,
    x: asFiniteNumber(element.x, 0) + dx,
    y: asFiniteNumber(element.y, 0) + dy,
  };
}

function sharesGroup(elementA, elementB) {
  if (!Array.isArray(elementA.groupIds) || !Array.isArray(elementB.groupIds)) {
    return false;
  }

  return elementA.groupIds.some((groupId) => elementB.groupIds.includes(groupId));
}

export function resolveOverlaps(elements) {
  const resolved = elements.map((element) => ({ ...element }));

  for (let iteration = 0; iteration < 10; iteration++) {
    let moved = false;
    const layoutIndexes = resolved
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => LAYOUT_NODE_TYPES.has(element.type))
      .sort((a, b) => (a.element.y || 0) - (b.element.y || 0) || (a.element.x || 0) - (b.element.x || 0))
      .map(({ index }) => index);

    for (let i = 0; i < layoutIndexes.length; i++) {
      for (let j = i + 1; j < layoutIndexes.length; j++) {
        const indexA = layoutIndexes[i];
        const indexB = layoutIndexes[j];
        const elementA = resolved[indexA];
        const elementB = resolved[indexB];

        if (sharesGroup(elementA, elementB)) {
          continue;
        }

        const boundsA = getElementBounds(elementA);
        const boundsB = getElementBounds(elementB);
        const overlapX = Math.min(boundsA.right, boundsB.right) - Math.max(boundsA.left, boundsB.left);
        const overlapY = Math.min(boundsA.bottom, boundsB.bottom) - Math.max(boundsA.top, boundsB.top);

        if (overlapX <= -LAYOUT_GAP || overlapY <= -LAYOUT_GAP) {
          continue;
        }

        const centerAX = (boundsA.left + boundsA.right) / 2;
        const centerAY = (boundsA.top + boundsA.bottom) / 2;
        const centerBX = (boundsB.left + boundsB.right) / 2;
        const centerBY = (boundsB.top + boundsB.bottom) / 2;
        const pushX = overlapX + LAYOUT_GAP;
        const pushY = overlapY + LAYOUT_GAP;

        if (Math.abs(centerAY - centerBY) <= Math.abs(centerAX - centerBX)) {
          const direction = centerBX >= centerAX ? 1 : -1;
          resolved[indexB] = shiftElement(elementB, direction * pushX, 0);
        } else {
          const direction = centerBY >= centerAY ? 1 : -1;
          resolved[indexB] = shiftElement(elementB, 0, direction * pushY);
        }

        moved = true;
      }
    }

    if (!moved) {
      break;
    }
  }

  return resolved;
}

/**
 * Determine the optimal edge pairs for two elements based on their relative positions
 * Returns the edge directions that should be used for start and end elements
 */
function determineEdges(startEle, endEle) {
  const startX = startEle.x || 0;
  const startY = startEle.y || 0;
  const startWidth = startEle.width || 100;
  const startHeight = startEle.height || 100;

  const endX = endEle.x || 0;
  const endY = endEle.y || 0;
  const endWidth = endEle.width || 100;
  const endHeight = endEle.height || 100;

  // Calculate center points for accurate relative positioning
  const startCenterX = startX + startWidth / 2;
  const startCenterY = startY + startHeight / 2;
  const endCenterX = endX + endWidth / 2;
  const endCenterY = endY + endHeight / 2;

  // dx and dy only used for determining relative position direction
  const dx = startCenterX - endCenterX;
  const dy = startCenterY - endCenterY;

  // Calculate distance differences between possible edge pairs
  const leftToRightDistance = (startX - (endX + endWidth));
  const rightToLeftDistance = -((startX + startWidth) - endX);
  const topToBottomDistance = (startY - (endY + endHeight));
  const bottomToTopDistance = -((startY + startHeight) - endY);

  let startEdge, endEdge;

  if (dx > 0 && dy > 0) {
    // startEle is in lower-right quadrant relative to endEle
    if (leftToRightDistance > topToBottomDistance) {
      startEdge = 'left'; endEdge = 'right';
    } else {
      startEdge = 'top'; endEdge = 'bottom';
    }
  } else if (dx < 0 && dy > 0) {
    // startEle is in lower-left quadrant relative to endEle
    if (rightToLeftDistance > topToBottomDistance) {
      startEdge = 'right'; endEdge = 'left';
    } else {
      startEdge = 'top'; endEdge = 'bottom';
    }
  } else if (dx > 0 && dy < 0) {
    // startEle is in upper-right quadrant relative to endEle
    if (leftToRightDistance > bottomToTopDistance) {
      startEdge = 'left'; endEdge = 'right';
    } else {
      startEdge = 'bottom'; endEdge = 'top';
    }
  } else if (dx < 0 && dy < 0) {
    // startEle is in upper-left quadrant relative to endEle
    if (rightToLeftDistance > bottomToTopDistance) {
      startEdge = 'right'; endEdge = 'left';
    } else {
      startEdge = 'bottom'; endEdge = 'top';
    }
  } else if (dx === 0 && dy > 0) {
    // Directly below
    startEdge = 'top'; endEdge = 'bottom';
  } else if (dx === 0 && dy < 0) {
    // Directly above
    startEdge = 'bottom'; endEdge = 'top';
  } else if (dx > 0 && dy === 0) {
    // Directly to the right
    startEdge = 'left'; endEdge = 'right';
  } else if (dx < 0 && dy === 0) {
    // Directly to the left
    startEdge = 'right'; endEdge = 'left';
  } else {
    // Default case (overlapping elements)
    startEdge = 'right'; endEdge = 'left';
  }

  return { startEdge, endEdge };
}

/**
 * Get the center point of a specified edge for an element
 */
function getEdgeCenter(element, edge) {
  const x = element.x || 0;
  const y = element.y || 0;
  const width = element.width || 100;
  const height = element.height || 100;

  switch (edge) {
    case 'left':
      return { x: x, y: y + height / 2 };
    case 'right':
      return { x: x + width, y: y + height / 2 };
    case 'top':
      return { x: x + width / 2, y: y };
    case 'bottom':
      return { x: x + width / 2, y: y + height };
    default:
      // Default to right edge
      return { x: x + width, y: y + height / 2 };
  }
}

/**
 * Get the optimal edge center point for start element
 */
function getStartEdgeCenter(startEle, endEle) {
  const { startEdge } = determineEdges(startEle, endEle);
  return getEdgeCenter(startEle, startEdge);
}

/**
 * Get the optimal edge center point for end element
 */
function getEndEdgeCenter(endEle, startEle) {
  const { endEdge } = determineEdges(startEle, endEle);
  return getEdgeCenter(endEle, endEdge);
}

/**
 * Optimize arrow/line coordinates to align with bound element edge centers
 */
export function optimizeExcalidrawCode(codeString, chartType = 'auto') {
  if (!codeString || typeof codeString !== 'string') {
    return codeString;
  }

  try {
    // Step 1: Parse JSON string to array
    const cleanedCode = codeString.trim();
    const arrayMatch = cleanedCode.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      console.error('No array found in code');
      return codeString;
    }

    const parsed = safeParseJsonWithRepair(arrayMatch[0]);
    if (!parsed.ok) {
      console.error('Failed to parse elements array:', parsed.error);
      return codeString;
    }
    const elements = parsed.value;
    if (!Array.isArray(elements)) {
      console.error('Parsed code is not an array');
      return codeString;
    }

    const normalizedElements = elements.map(normalizeContainerLabel);
    const preparedElements = applyLayoutEngine(normalizedElements, chartType);

    // Create a map of elements by ID for quick lookup
    const elementMap = new Map();
    preparedElements.forEach(el => {
      if (el.id) {
        elementMap.set(el.id, el);
      }
    });

    // Step 2 & 3: Find and optimize arrows/lines with bound elements
    const optimizedElements = preparedElements.map(element => {
      // Only process arrow and line elements
      if (element.type !== 'arrow' && element.type !== 'line') {
        return element;
      }

      const optimized = { ...element };
      let needsOptimization = false;

      // Get bound elements
      const startEle = element.start && element.start.id ? elementMap.get(element.start.id) : null;
      const endEle = element.end && element.end.id ? elementMap.get(element.end.id) : null;


      // Both start and end must be bound to calculate correctly
      if (startEle && endEle) {

        // Calculate start point (arrow.x, arrow.y)
        const startEdgeCenter = getStartEdgeCenter(startEle, endEle);
        optimized.x = startEdgeCenter.x;
        optimized.y = startEdgeCenter.y;

        // Calculate end point and derive width/height
        const endEdgeCenter = getEndEdgeCenter(endEle, startEle);
        optimized.width = endEdgeCenter.x - startEdgeCenter.x;
        optimized.height = endEdgeCenter.y - startEdgeCenter.y;
        optimized.points = [
          [0, 0],
          [optimized.width, optimized.height],
        ];


        needsOptimization = true;
      }

      // Fix Excalidraw rendering bug: line-type elements with width 0 should be 1
      if ((element.type === 'arrow' || element.type === 'line') && optimized.width === 0) {
        optimized.width = 1;
        needsOptimization = true;
      }

      return needsOptimization ? optimized : element;

    });

    // Step 4: Convert back to JSON string
    return JSON.stringify(optimizedElements, null, 2);
  } catch (error) {
    console.error('Failed to optimize arrows:', error);
    return codeString; // Return original code if optimization fails
  }
}
