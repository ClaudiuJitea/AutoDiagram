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

export const CHART_TYPE_DETAILS = {
  flowchart: {
    meaning: 'A process diagram that shows actions, decisions, and directional flow.',
    bestFor: 'workflows, operating procedures, business logic, and approval paths',
  },
  mindmap: {
    meaning: 'A radial idea map that branches outward from one central topic.',
    bestFor: 'brainstorming, topic exploration, and note structuring',
  },
  orgchart: {
    meaning: 'A hierarchy chart that shows reporting or parent-child structure.',
    bestFor: 'teams, departments, ownership maps, and command chains',
  },
  sequence: {
    meaning: 'A time-ordered interaction diagram between participants or systems.',
    bestFor: 'API flows, request lifecycles, and step-by-step system interactions',
  },
  class: {
    meaning: 'A UML structure diagram showing classes, attributes, methods, and relationships.',
    bestFor: 'object models, software design, and inheritance mapping',
  },
  er: {
    meaning: 'A database model diagram showing entities, attributes, and relationships.',
    bestFor: 'schema design, data modeling, and relational database planning',
  },
  gantt: {
    meaning: 'A schedule chart that places tasks against time.',
    bestFor: 'project plans, delivery schedules, and milestone tracking',
  },
  timeline: {
    meaning: 'A chronological diagram that places events in time order.',
    bestFor: 'historical sequences, roadmaps, and release narratives',
  },
  tree: {
    meaning: 'A branching hierarchy that expands from a root into child nodes.',
    bestFor: 'taxonomy, decomposition, and nested category structures',
  },
  network: {
    meaning: 'A topology diagram showing nodes and the links between them.',
    bestFor: 'IT infrastructure, VLAN layouts, connectivity maps, and network design',
  },
  architecture: {
    meaning: 'A layered or grouped system diagram showing major components and boundaries.',
    bestFor: 'platforms, service ecosystems, deployments, and technical overviews',
  },
  dataflow: {
    meaning: 'A diagram focused on how data moves between actors, processes, and stores.',
    bestFor: 'ETL pipelines, integrations, event processing, and information handoffs',
  },
  state: {
    meaning: 'A lifecycle diagram showing states and the transitions between them.',
    bestFor: 'workflows with statuses, finite state machines, and lifecycle design',
  },
  swimlane: {
    meaning: 'A process diagram divided into lanes by role, team, or system.',
    bestFor: 'cross-functional workflows and responsibility mapping',
  },
  concept: {
    meaning: 'A relationship map between ideas, concepts, and their connections.',
    bestFor: 'knowledge graphs, learning material, and conceptual explanation',
  },
  fishbone: {
    meaning: 'A cause-and-effect diagram that organizes contributing factors.',
    bestFor: 'root cause analysis, incident reviews, and problem diagnosis',
  },
  swot: {
    meaning: 'A four-quadrant analysis of strengths, weaknesses, opportunities, and threats.',
    bestFor: 'strategic planning, assessments, and competitive reviews',
  },
  pyramid: {
    meaning: 'A stacked hierarchy where each level builds on the next.',
    bestFor: 'priority layers, maturity stages, and hierarchical concepts',
  },
  funnel: {
    meaning: 'A narrowing stage diagram that shows drop-off across steps.',
    bestFor: 'conversion pipelines, sales stages, and filtering processes',
  },
  venn: {
    meaning: 'An overlapping set diagram showing shared and distinct areas.',
    bestFor: 'comparisons, intersections, and category overlap',
  },
  matrix: {
    meaning: 'A row-column grid used to compare items across two dimensions.',
    bestFor: 'prioritization, segmentation, and multi-axis comparison',
  },
  infographic: {
    meaning: 'A visual summary that combines cards, numbers, labels, and lightweight charts.',
    bestFor: 'high-level explainers, dashboards, and polished summaries',
  },
};
