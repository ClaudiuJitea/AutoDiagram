// Shared constants

// Design tokens
export const BRAND_COLOR = '#16b3a7';
export const BRAND_COLOR_DARK = '#0f7f78';
export const BRAND_COLOR_SOFT = '#def6f2';
export const BRAND_GLOW = 'rgba(22, 179, 167, 0.18)';
export const BORDER_COLOR = '#d9ebe7';
export const PAGE_BG = '#f4fbf9';
export const NAV_BG = '#eef8f6';
export const SURFACE_BG = '#ffffff';
export const SURFACE_ALT = '#f6fcfb';
export const BANNER_BG = '#e9f7f4';
export const TEXT_PRIMARY = '#173038';
export const TEXT_SECONDARY = '#5d757a';
export const TEXT_MUTED = '#88a0a2';
export const FONT_STACK = "var(--font-rubik), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Chart type options
// Must match CHART_TYPE_NAMES in lib/prompts.js
export const CHART_TYPES = {
  auto: 'Auto',
  flowchart: 'Flowchart',
  mindmap: 'Mind Map',
  orgchart: 'Org Chart',
  sequence: 'Sequence Diagram',
  class: 'UML Class Diagram',
  er: 'ER Diagram',
  gantt: 'Gantt Chart',
  timeline: 'Timeline',
  tree: 'Tree Diagram',
  network: 'Network Topology',
  architecture: 'Architecture Diagram',
  dataflow: 'Data Flow Diagram',
  state: 'State Diagram',
  swimlane: 'Swim Lane',
  concept: 'Concept Map',
  fishbone: 'Fishbone Diagram',
  swot: 'SWOT Analysis',
  pyramid: 'Pyramid Chart',
  funnel: 'Funnel Chart',
  venn: 'Venn Diagram',
  matrix: 'Matrix Chart',
  infographic: 'Infographic'
};
