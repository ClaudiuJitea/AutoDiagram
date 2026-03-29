import dagre from '@dagrejs/dagre';
import { resolveOverlaps } from './optimizeArrows.js';

const GRAPH_TYPES = new Set(['flowchart', 'orgchart', 'tree', 'mindmap', 'concept', 'network', 'architecture', 'dataflow', 'state', 'er', 'class', 'fishbone']);
const ALIGN_TYPES = new Set(['pyramid', 'funnel', 'timeline']);
const MATRIX_TYPES = new Set(['swot', 'matrix']);
const IGNORE_TYPES = new Set(['venn', 'infographic']);
const LAYOUT_NODE_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'image']);
const CONNECTOR_TYPES = new Set(['arrow', 'line', 'freedraw']);
const DEFAULT_START_X = 100;
const DEFAULT_START_Y = 100;
const PACK_GAP_X = 100;
const PACK_GAP_Y = 100;
const MAX_CANVAS_WIDTH = 900;
const PROXIMITY_GAP = 120;
const TEXT_PROXIMITY_GAP = 150;
const LARGE_CONTAINER_WIDTH = 420;
const LARGE_CONTAINER_HEIGHT = 220;
const CHAR_WIDTH_RATIO = 0.58;
const LINE_HEIGHT_RATIO = 1.35;

export function applyLayoutEngine(elements, chartType = 'flowchart') {
  if (!Array.isArray(elements) || elements.length === 0) return elements;

  const normalizedElements = cloneElements(elements);
  const elementsByType = normalizeElementIds(normalizedElements);
  resolveTypeBasedBindings(normalizedElements, elementsByType);

  const effectiveType = chartType;

  if (IGNORE_TYPES.has(effectiveType)) {
    return normalizeCanvasPosition(normalizedElements);
  }

  if (GRAPH_TYPES.has(effectiveType)) {
    return finalizeLayout(applyDagreLayout(normalizedElements, effectiveType));
  }

  if (ALIGN_TYPES.has(effectiveType)) {
    return finalizeLayout(applyCenteredLayout(normalizedElements));
  }

  if (MATRIX_TYPES.has(effectiveType)) {
    return finalizeLayout(resolveOverlaps(normalizedElements));
  }

  return finalizeLayout(packLooseBundles(normalizedElements));
}

function cloneElements(elements) {
  return elements.map((element) => ({
    ...element,
    groupIds: Array.isArray(element.groupIds) ? [...element.groupIds] : [],
    children: Array.isArray(element.children) ? [...element.children] : undefined,
    label: element.label ? { ...element.label } : element.label,
    start: element.start ? { ...element.start } : element.start,
    end: element.end ? { ...element.end } : element.end,
  }));
}

function normalizeElementIds(elements) {
  let idCounter = 1;
  const elementsByType = {};

  elements.forEach((element) => {
    if (!element.id) {
      element.id = `auto-${idCounter++}-${Math.floor(Math.random() * 10000)}`;
    }

    if (!elementsByType[element.type]) {
      elementsByType[element.type] = [];
    }
    elementsByType[element.type].push(element.id);
  });

  return elementsByType;
}

function resolveTypeBasedBindings(elements, elementsByType) {
  elements.forEach((element) => {
    if (element.type !== 'arrow') return;

    ['start', 'end'].forEach((bindingKey) => {
      const binding = element[bindingKey];
      if (!binding || binding.id || !binding.type) return;

      const matchingIds = elementsByType[binding.type];
      if (matchingIds && matchingIds.length > 0) {
        binding.id = matchingIds[0];
      }
    });
  });
}

function finalizeLayout(elements) {
  return normalizeCanvasPosition(packConnectedComponents(resolveOverlaps(elements)));
}

function packLooseBundles(elements) {
  if (shouldApplyCompactGrid(elements)) {
    return normalizeCanvasPosition(applyCompactNodeGrid(elements));
  }

  const packed = packElementBundles(elements);
  return normalizeCanvasPosition(packed);
}

function applyDagreLayout(elements, chartType) {
  const g = new dagre.graphlib.Graph({ compound: true });

  let rankdir = 'TB';
  if (chartType === 'mindmap' || chartType === 'fishbone' || chartType === 'network' || chartType === 'concept') {
    rankdir = 'LR';
  }

  g.setGraph({
    rankdir,
    nodesep: 80,
    edgesep: 40,
    ranksep: 120,
    marginx: DEFAULT_START_X,
    marginy: DEFAULT_START_Y,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeElements = elements.filter((element) => LAYOUT_NODE_TYPES.has(element.type) && !element.groupIds?.length);
  const nodeIds = new Set(nodeElements.map((element) => element.id));

  nodeElements.forEach((element) => {
    const width = Number.isFinite(element.width) && element.width > 0 ? element.width : 200;
    const height = Number.isFinite(element.height) && element.height > 0 ? element.height : 80;
    g.setNode(element.id, { width, height });
  });

  const arrowElements = elements.filter((element) => element.type === 'arrow');
  arrowElements.forEach((arrow) => {
    if (arrow.start?.id && arrow.end?.id && nodeIds.has(arrow.start.id) && nodeIds.has(arrow.end.id)) {
      g.setEdge(arrow.start.id, arrow.end.id);
    }
  });

  if (g.edgeCount() === 0) {
    return packLooseBundles(elements);
  }

  try {
    dagre.layout(g);

    const layoutMap = new Map();
    g.nodes().forEach((id) => {
      const node = g.node(id);
      if (!node) return;

      layoutMap.set(id, {
        x: Math.round(node.x - node.width / 2),
        y: Math.round(node.y - node.height / 2),
      });
    });

    return elements.map((element) => {
      if (!layoutMap.has(element.id)) return element;
      const { x, y } = layoutMap.get(element.id);
      return { ...element, x, y };
    });
  } catch (error) {
    console.warn('Dagre layout failed:', error);
    return packLooseBundles(elements);
  }
}

function applyCenteredLayout(elements) {
  const nodes = elements.filter((element) => ['rectangle', 'ellipse', 'diamond', 'text'].includes(element.type) && !element.groupIds?.length);
  if (nodes.length === 0) return packLooseBundles(elements);

  const sortedNodes = [...nodes].sort((a, b) => (a.y || 0) - (b.y || 0));
  const centerX = 800;
  let currentY = DEFAULT_START_Y;
  const layoutMap = new Map();

  sortedNodes.forEach((node) => {
    const width = Number.isFinite(node.width) && node.width > 0 ? node.width : 200;
    const height = Number.isFinite(node.height) && node.height > 0 ? node.height : 80;

    layoutMap.set(node.id, {
      x: centerX - width / 2,
      y: currentY,
    });
    currentY += height + 60;
  });

  return elements.map((element) => {
    if (!layoutMap.has(element.id)) return element;
    const { x, y } = layoutMap.get(element.id);
    return { ...element, x, y };
  });
}

function packConnectedComponents(elements) {
  return packElementBundles(elements, { includeBoundConnectors: true });
}

function packElementBundles(elements, options = {}) {
  const { includeBoundConnectors = false } = options;
  const bundles = buildBundles(elements);
  if (bundles.length <= 1) {
    return elements;
  }

  const indexToBundle = new Map();
  bundles.forEach((bundle, bundleIndex) => {
    bundle.members.forEach((memberIndex) => {
      indexToBundle.set(memberIndex, bundleIndex);
    });
  });

  const bundleMemberSets = bundles.map((bundle) => new Set(bundle.members));
  const idToIndex = new Map(
    elements
      .map((element, index) => [element.id, index])
      .filter(([id]) => typeof id === 'string')
  );

  if (includeBoundConnectors) {
    elements.forEach((element, index) => {
      if (!CONNECTOR_TYPES.has(element.type)) return;

      const startIndex = element.start?.id ? idToIndex.get(element.start.id) : undefined;
      const endIndex = element.end?.id ? idToIndex.get(element.end.id) : undefined;
      const bundleIndexes = [startIndex, endIndex]
        .filter((value) => Number.isInteger(value))
        .map((value) => indexToBundle.get(value))
        .filter((value) => Number.isInteger(value));

      if (bundleIndexes.length === 0) return;

      const targetBundleIndex = bundleIndexes[0];
      const sameBundle = bundleIndexes.every((bundleIndex) => bundleIndex === targetBundleIndex);
      if (!sameBundle) return;

      bundleMemberSets[targetBundleIndex].add(index);
    });
  }

  const sortedBundles = bundles
    .map((bundle, index) => ({
      index,
      members: bundleMemberSets[index],
      bounds: getBoundsForIndexes(elements, bundleMemberSets[index]),
    }))
    .filter((bundle) => bundle.bounds)
    .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);

  if (sortedBundles.length <= 1) {
    return elements;
  }

  const totalArea = sortedBundles.reduce((sum, bundle) => sum + getBoundsArea(bundle.bounds), 0);
  const targetRowWidth = clamp(Math.round(Math.sqrt(Math.max(totalArea, 1)) * 1.8), 760, MAX_CANVAS_WIDTH);
  const translated = cloneElements(elements);
  let cursorX = DEFAULT_START_X;
  let cursorY = DEFAULT_START_Y;
  let rowHeight = 0;

  sortedBundles.forEach((bundle) => {
    const width = getBoundsWidth(bundle.bounds);
    const height = getBoundsHeight(bundle.bounds);

    if (cursorX > DEFAULT_START_X && cursorX + width > DEFAULT_START_X + targetRowWidth) {
      cursorX = DEFAULT_START_X;
      cursorY += rowHeight + PACK_GAP_Y;
      rowHeight = 0;
    }

    const dx = cursorX - bundle.bounds.left;
    const dy = cursorY - bundle.bounds.top;

    bundle.members.forEach((memberIndex) => {
      translated[memberIndex] = translateElement(translated[memberIndex], dx, dy);
    });

    cursorX += width + PACK_GAP_X;
    rowHeight = Math.max(rowHeight, height);
  });

  return translated;
}

function buildBundles(elements) {
  const candidateIndexes = elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => LAYOUT_NODE_TYPES.has(element.type) || element.type === 'frame')
    .map(({ index }) => index);

  if (candidateIndexes.length === 0) {
    return [];
  }

  const parents = new Map(candidateIndexes.map((index) => [index, index]));
  const ranks = new Map(candidateIndexes.map((index) => [index, 0]));
  const candidateSet = new Set(candidateIndexes);
  const idToIndex = new Map(
    elements
      .map((element, index) => [element.id, index])
      .filter(([id]) => typeof id === 'string')
  );

  const find = (index) => {
    const parent = parents.get(index);
    if (parent === index) return parent;
    const root = find(parent);
    parents.set(index, root);
    return root;
  };

  const union = (a, b) => {
    if (!candidateSet.has(a) || !candidateSet.has(b)) return;

    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;

    const rankA = ranks.get(rootA) || 0;
    const rankB = ranks.get(rootB) || 0;

    if (rankA < rankB) {
      parents.set(rootA, rootB);
    } else if (rankA > rankB) {
      parents.set(rootB, rootA);
    } else {
      parents.set(rootB, rootA);
      ranks.set(rootA, rankA + 1);
    }
  };

  const groupOwners = new Map();
  candidateIndexes.forEach((index) => {
    const groupIds = elements[index].groupIds || [];
    groupIds.forEach((groupId) => {
      const owner = groupOwners.get(groupId);
      if (Number.isInteger(owner)) union(owner, index);
      else groupOwners.set(groupId, index);
    });
  });

  candidateIndexes.forEach((index) => {
    const element = elements[index];
    if (element.type !== 'frame' || !Array.isArray(element.children)) return;

    element.children.forEach((childId) => {
      const childIndex = idToIndex.get(childId);
      if (Number.isInteger(childIndex)) {
        union(index, childIndex);
      }
    });
  });

  for (let i = 0; i < candidateIndexes.length; i++) {
    for (let j = i + 1; j < candidateIndexes.length; j++) {
      const indexA = candidateIndexes[i];
      const indexB = candidateIndexes[j];
      if (areElementsRelated(elements[indexA], elements[indexB])) {
        union(indexA, indexB);
      }
    }
  }

  const bundles = new Map();
  candidateIndexes.forEach((index) => {
    const root = find(index);
    if (!bundles.has(root)) {
      bundles.set(root, { members: [] });
    }
    bundles.get(root).members.push(index);
  });

  return [...bundles.values()];
}

function shouldApplyCompactGrid(elements) {
  const nodeIndexes = elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => LAYOUT_NODE_TYPES.has(element.type))
    .map(({ index }) => index);

  if (nodeIndexes.length < 4) {
    return false;
  }

  const bounds = getBoundsForIndexes(elements, new Set(nodeIndexes));
  if (!bounds) {
    return false;
  }

  const nodeArea = nodeIndexes.reduce((sum, index) => sum + getBoundsArea(getElementBounds(elements[index])), 0);
  const layoutArea = Math.max(getBoundsArea(bounds), 1);
  const density = nodeArea / layoutArea;
  const wideLayout = getBoundsWidth(bounds) > 900;
  const tallLayout = getBoundsHeight(bounds) > 700;

  return density < 0.42 || wideLayout || tallLayout;
}

function applyCompactNodeGrid(elements) {
  const nodeIndexes = elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => LAYOUT_NODE_TYPES.has(element.type))
    .sort((a, b) => (a.element.y || 0) - (b.element.y || 0) || (a.element.x || 0) - (b.element.x || 0))
    .map(({ index }) => index);

  if (nodeIndexes.length === 0) {
    return elements;
  }

  const translated = cloneElements(elements);
  const columnCount = clamp(Math.ceil(Math.sqrt(nodeIndexes.length)), 2, 4);
  const rowHeights = [];
  const rowOffsets = [];
  let currentY = DEFAULT_START_Y;

  for (let start = 0; start < nodeIndexes.length; start += columnCount) {
    const rowIndexes = nodeIndexes.slice(start, start + columnCount);
    const rowHeight = rowIndexes.reduce((max, index) => {
      const bounds = getElementBounds(elements[index]);
      return Math.max(max, bounds ? getBoundsHeight(bounds) : 0);
    }, 0);

    rowHeights.push(rowHeight);
    rowOffsets.push(currentY);
    currentY += rowHeight + PACK_GAP_Y;
  }

  for (let start = 0, row = 0; start < nodeIndexes.length; start += columnCount, row++) {
    const rowIndexes = nodeIndexes.slice(start, start + columnCount);
    let currentX = DEFAULT_START_X;

    rowIndexes.forEach((index) => {
      const bounds = getElementBounds(elements[index]);
      if (!bounds) return;

      const dx = currentX - bounds.left;
      const dy = rowOffsets[row] - bounds.top;
      translated[index] = translateElement(translated[index], dx, dy);
      currentX += getBoundsWidth(bounds) + PACK_GAP_X;
    });
  }

  return translated;
}

function areElementsRelated(elementA, elementB) {
  if (!elementA || !elementB) return false;
  if (sharesGroup(elementA, elementB)) return true;

  const boundsA = getElementBounds(elementA);
  const boundsB = getElementBounds(elementB);
  if (!boundsA || !boundsB) return false;

  if (isLikelyContainer(elementA) || isLikelyContainer(elementB)) {
    if (boundsOverlap(boundsA, boundsB, Math.floor(PROXIMITY_GAP * 0.75))) return true;
    if (containsBounds(boundsA, boundsB, 40) || containsBounds(boundsB, boundsA, 40)) return true;
    return getBoundsGap(boundsA, boundsB) <= PROXIMITY_GAP;
  }

  const proximityPadding = elementA.type === 'text' || elementB.type === 'text' ? TEXT_PROXIMITY_GAP : PROXIMITY_GAP;
  return boundsOverlap(boundsA, boundsB, proximityPadding);
}

function isLikelyContainer(element) {
  if (element.type === 'frame') return true;
  const bounds = getElementBounds(element);
  if (!bounds) return false;

  return getBoundsWidth(bounds) >= LARGE_CONTAINER_WIDTH || getBoundsHeight(bounds) >= LARGE_CONTAINER_HEIGHT;
}

function getElementBounds(element) {
  if (!element) return null;

  if (element.type === 'arrow' || element.type === 'line') {
    const x1 = asFiniteNumber(element.x, 0);
    const y1 = asFiniteNumber(element.y, 0);
    const x2 = x1 + asFiniteNumber(element.width, 100);
    const y2 = y1 + asFiniteNumber(element.height, 0);
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.max(x1, x2),
      bottom: Math.max(y1, y2),
    };
  }

  const x = asFiniteNumber(element.x, 0);
  const y = asFiniteNumber(element.y, 0);

  if (element.type === 'text') {
    const text = typeof element.text === 'string' ? element.text : '';
    const fontSize = asFiniteNumber(element.fontSize, 20);
    const lines = text.split(/\r?\n/).filter(Boolean);
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const width = Math.max(asFiniteNumber(element.width, 0), Math.ceil(longestLine * fontSize * CHAR_WIDTH_RATIO));
    const height = Math.max(
      asFiniteNumber(element.height, 0),
      Math.ceil(Math.max(lines.length, 1) * fontSize * LINE_HEIGHT_RATIO)
    );

    return { left: x, top: y, right: x + width, bottom: y + height };
  }

  const width = asFiniteNumber(element.width, 200);
  const height = asFiniteNumber(element.height, 80);
  return { left: x, top: y, right: x + width, bottom: y + height };
}

function getBoundsForIndexes(elements, indexes) {
  const boundsList = [...indexes]
    .map((index) => getElementBounds(elements[index]))
    .filter(Boolean);

  if (boundsList.length === 0) return null;

  return boundsList.reduce(
    (acc, bounds) => ({
      left: Math.min(acc.left, bounds.left),
      top: Math.min(acc.top, bounds.top),
      right: Math.max(acc.right, bounds.right),
      bottom: Math.max(acc.bottom, bounds.bottom),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  );
}

function normalizeCanvasPosition(elements) {
  const bounds = getBoundsForIndexes(elements, new Set(elements.map((_, index) => index)));
  if (!bounds) return elements;

  const dx = DEFAULT_START_X - bounds.left;
  const dy = DEFAULT_START_Y - bounds.top;
  if (dx === 0 && dy === 0) return elements;

  return elements.map((element) => translateElement(element, dx, dy));
}

function translateElement(element, dx, dy) {
  const translated = { ...element };
  if (Number.isFinite(element.x)) translated.x = element.x + dx;
  if (Number.isFinite(element.y)) translated.y = element.y + dy;
  return translated;
}

function sharesGroup(elementA, elementB) {
  if (!Array.isArray(elementA.groupIds) || !Array.isArray(elementB.groupIds)) {
    return false;
  }

  return elementA.groupIds.some((groupId) => elementB.groupIds.includes(groupId));
}

function containsBounds(containerBounds, childBounds, padding = 0) {
  return (
    containerBounds.left - padding <= childBounds.left &&
    containerBounds.top - padding <= childBounds.top &&
    containerBounds.right + padding >= childBounds.right &&
    containerBounds.bottom + padding >= childBounds.bottom
  );
}

function boundsOverlap(boundsA, boundsB, padding = 0) {
  return !(
    boundsA.right + padding < boundsB.left ||
    boundsB.right + padding < boundsA.left ||
    boundsA.bottom + padding < boundsB.top ||
    boundsB.bottom + padding < boundsA.top
  );
}

function getBoundsArea(bounds) {
  return getBoundsWidth(bounds) * getBoundsHeight(bounds);
}

function getBoundsGap(boundsA, boundsB) {
  const gapX = Math.max(0, Math.max(boundsA.left - boundsB.right, boundsB.left - boundsA.right));
  const gapY = Math.max(0, Math.max(boundsA.top - boundsB.bottom, boundsB.top - boundsA.bottom));
  return Math.hypot(gapX, gapY);
}

function getBoundsWidth(bounds) {
  return Math.max(0, bounds.right - bounds.left);
}

function getBoundsHeight(bounds) {
  return Math.max(0, bounds.bottom - bounds.top);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
