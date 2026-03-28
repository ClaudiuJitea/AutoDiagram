import dagre from '@dagrejs/dagre';
import { resolveOverlaps } from './optimizeArrows.js';

const GRAPH_TYPES = new Set(['flowchart', 'orgchart', 'tree', 'mindmap', 'concept', 'network', 'architecture', 'dataflow', 'state', 'er', 'class', 'fishbone']);
const ALIGN_TYPES = new Set(['pyramid', 'funnel', 'timeline']);
const MATRIX_TYPES = new Set(['swot', 'matrix']);
const IGNORE_TYPES = new Set(['venn', 'infographic']);
// swimlane, sequence, gantt will fall back to overlap resolver

export function applyLayoutEngine(elements, chartType = 'auto') {
  if (!elements || elements.length === 0) return elements;
  
  // Decide the layout strategy
  let effectiveType = chartType;
  if (chartType === 'auto') {
    // Heuristic: if there are several arrows connecting nodes, it's likely a graph
    const arrowCount = elements.filter(e => e.type === 'arrow' && e.start && e.end).length;
    effectiveType = arrowCount > 0 ? 'flowchart' : 'unknown';
  }

  // 1. Specialized / Allow-Overlaps (Venn etc)
  if (IGNORE_TYPES.has(effectiveType)) {
    return elements; // don't even run resolveOverlaps!
  }

  // 2. Graph / Tree Strategy (Dagre)
  if (GRAPH_TYPES.has(effectiveType)) {
    return applyDagreLayout(elements, effectiveType);
  }

  // 3. Alignment / Centered
  if (ALIGN_TYPES.has(effectiveType)) {
    return applyCenteredLayout(elements);
  }

  // 4. Grid / Matrix (and fallback for swimlane/sequence)
  // For SWOT/Matrix we just use basic overlap resolution so we don't destroy the LLM's 2x2 intent
  return resolveOverlaps(elements);
}

function applyDagreLayout(elements, chartType) {
  const g = new dagre.graphlib.Graph({ compound: true });
  
  let rankdir = 'TB';
  if (chartType === 'mindmap' || chartType === 'fishbone' || chartType === 'network' || chartType === 'concept') {
    rankdir = 'LR';
  }

  g.setGraph({
    rankdir: rankdir,
    nodesep: 80,
    edgesep: 40,
    ranksep: 120,
    marginx: 100,
    marginy: 100,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Find nodes (we exclude elements inside a group for now, or just add them)
  const nodeElements = elements.filter(e => ['rectangle', 'ellipse', 'diamond', 'text', 'image'].includes(e.type) && !e.groupIds?.length);
  const nodeIds = new Set(nodeElements.map(e => e.id));
  
  nodeElements.forEach(el => {
    // Ensure we have finite dimensions
    const width = Number.isFinite(el.width) && el.width > 0 ? el.width : 200;
    const height = Number.isFinite(el.height) && el.height > 0 ? el.height : 80;
    g.setNode(el.id, { width, height });
  });

  // Find edges
  const arrowElements = elements.filter(e => e.type === 'arrow');
  arrowElements.forEach(arrow => {
    if (arrow.start?.id && arrow.end?.id && nodeIds.has(arrow.start.id) && nodeIds.has(arrow.end.id)) {
      g.setEdge(arrow.start.id, arrow.end.id);
    }
  });

  // If no edges, fallback to overlap resolution
  if (g.edgeCount() === 0) {
    return resolveOverlaps(elements);
  }

  try {
    dagre.layout(g);
    
    // Update coordinates
    const layoutMap = new Map();
    g.nodes().forEach(id => {
      const node = g.node(id);
      if (node) {
        // Dagre returns the center x,y. Excalidraw uses top-left x,y.
        layoutMap.set(id, {
          x: Math.round(node.x - node.width / 2),
          y: Math.round(node.y - node.height / 2)
        });
      }
    });

    return elements.map(el => {
      if (layoutMap.has(el.id)) {
        const { x, y } = layoutMap.get(el.id);
        return { ...el, x, y };
      }
      return el;
    });

  } catch(e) {
    console.warn("Dagre layout failed:", e);
    return resolveOverlaps(elements);
  }
}

function applyCenteredLayout(elements) {
  // Sort nodes by their original Y coordinate to maintain the sequence
  const nodes = elements.filter(e => ['rectangle', 'ellipse', 'diamond', 'text'].includes(e.type) && !e.groupIds?.length);
  if (nodes.length === 0) return resolveOverlaps(elements);

  const sortedNodes = [...nodes].sort((a, b) => (a.y || 0) - (b.y || 0));
  
  const centerX = 800;
  let currentY = 100;

  const layoutMap = new Map();
  sortedNodes.forEach(n => {
    const width = Number.isFinite(n.width) && n.width > 0 ? n.width : 200;
    const height = Number.isFinite(n.height) && n.height > 0 ? n.height : 80;
    
    layoutMap.set(n.id, {
      x: centerX - width / 2,
      y: currentY
    });
    currentY += height + 60; // 60px vertical gap
  });

  return elements.map(el => {
    if (layoutMap.has(el.id)) {
      const { x, y } = layoutMap.get(el.id);
      return { ...el, x, y };
    }
    return el;
  });
}
