import { callLLM } from './llm-client.js';
import { safeParseJsonWithRepair } from './json-repair.js';
import { optimizeExcalidrawCode } from './optimizeArrows.js';
import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from './prompts.js';

const DIAGRAM_TYPES = new Set([
  'flowchart',
  'mindmap',
  'orgchart',
  'sequence',
  'class',
  'er',
  'gantt',
  'timeline',
  'tree',
  'network',
  'architecture',
  'dataflow',
  'state',
  'swimlane',
  'concept',
  'fishbone',
  'swot',
  'pyramid',
  'funnel',
  'venn',
  'matrix',
  'infographic',
]);

const KIND_ALIASES = new Map([
  ['action', 'process'],
  ['activity', 'process'],
  ['app', 'service'],
  ['application', 'service'],
  ['attribute', 'attribute'],
  ['choice', 'decision'],
  ['class', 'class'],
  ['component', 'service'],
  ['condition', 'decision'],
  ['database', 'database'],
  ['datastore', 'database'],
  ['decision', 'decision'],
  ['end', 'end'],
  ['entity', 'entity'],
  ['event', 'event'],
  ['external', 'actor'],
  ['group', 'group'],
  ['human', 'actor'],
  ['note', 'note'],
  ['participant', 'participant'],
  ['person', 'actor'],
  ['process', 'process'],
  ['queue', 'data'],
  ['role', 'actor'],
  ['service', 'service'],
  ['stage', 'process'],
  ['start', 'start'],
  ['state', 'state'],
  ['step', 'process'],
  ['store', 'database'],
  ['system', 'service'],
]);

const PLAN_SYSTEM_PROMPT = `You convert prompts, files, and images into a compact semantic diagram plan.

You are not drawing Excalidraw elements. You are preparing a structured plan that another program will render.

Output rules:
- Output exactly one JSON object and nothing else.
- Do not wrap the JSON in markdown fences.
- Do not output Excalidraw elements, coordinates, widths, heights, colors, or points.
- Prefer a clean, readable diagram over exhaustive extraction of every tiny label.
- Merge only truly duplicate or low-value items. Keep the diagram focused, but do not over-compress source material that contains important steps, facts, numbers, labels, roles, constraints, or examples.
- For image input, reconstruct the clean underlying diagram. Ignore screenshot chrome, accidental spacing, zoom controls, and decorative artifacts.

Allowed diagramType values:
flowchart, mindmap, orgchart, sequence, class, er, gantt, timeline, tree, network, architecture, dataflow, state, swimlane, concept, fishbone, swot, pyramid, funnel, venn, matrix, infographic

Schema:
{
  "title": "short diagram title",
  "diagramType": "one allowed value",
  "summary": "one sentence",
  "sections": [
    {
      "id": "short-id",
      "title": "section title",
      "kind": "frame|lane|cluster|quadrant",
      "items": ["node-id-1", "node-id-2"]
    }
  ],
  "nodes": [
    {
      "id": "short-id",
      "label": "visible node title",
      "kind": "start|end|process|decision|service|database|actor|data|event|state|entity|attribute|note|class|participant|group",
      "sectionId": "optional section id",
      "details": ["short supporting line", "short supporting line"],
      "parentId": "optional parent node id"
    }
  ],
  "edges": [
    {
      "from": "node-id",
      "to": "node-id",
      "label": "short optional relationship label",
      "style": "solid|dashed"
    }
  ]
}

Planning rules:
- Most prompts should produce between 4 and 18 meaningful nodes.
- For dense text or article input, expand to roughly 8 to 24 nodes when needed to preserve the important structure and supporting detail.
- Use sections for lanes, layers, quadrants, or bounded concerns.
- Use edges only for meaningful relationships.
- If the user explicitly requested a chart type, treat that type as a hard constraint. Do not substitute a related diagram format.
- For text input, preserve important named entities, figures, ordered steps, decision criteria, section headings, and causal relationships instead of replacing them with generic summary labels.
- For text input, prefer nodes with supporting detail lines when the source contains concrete specifics that would be lost in a one-line label.
- For architecture/network/dataflow diagrams, prefer sections such as clients, edge, services, storage, external systems, VLANs, or environments.
- For network diagrams, prefer concrete networking device labels when present in the input, such as router, switch, firewall, access point, server, workstation, cloud, VPN, subnet, or VLAN.
- For network diagrams reconstructed from images, preserve bounded regions such as AS clouds, subnets, VLANs, or sites as sections/clusters instead of flattening everything into one linear chain.
- For sequence diagrams, use sections or participant nodes for the actors and put message order in the edge order.
- For SWOT or matrix diagrams, use four sections/quadrants and place nodes inside them.
- For timelines, order nodes chronologically.
- For code or system prompts, prefer architecture, dataflow, class, or flowchart depending on what best explains the input.
- If the user requested a specific chart type, honor it unless it would make the result nonsensical.`;

export async function generateDiagramElements(config, userInput, chartType = 'flowchart') {
  const planMessages = buildPlanMessages(userInput, chartType);
  const planResponse = await callLLM(config, planMessages);
  const parsedPlan = parseModelJson(planResponse);

  if (parsedPlan.ok && Array.isArray(parsedPlan.value)) {
    return {
      elements: finalizeElementArray(parsedPlan.value, chartType),
      diagramType: chartType,
      mode: 'legacy-array',
    };
  }

  if (parsedPlan.ok && parsedPlan.value && typeof parsedPlan.value === 'object') {
    const plan = enrichDiagramPlanFromInput(
      normalizeDiagramPlan(parsedPlan.value, chartType),
      userInput,
      chartType
    );
    const rendered = renderDiagramPlan(plan);
    return {
      elements: finalizeElementArray(rendered, plan.diagramType, { preserveLayout: true }),
      diagramType: plan.diagramType,
      mode: 'semantic-plan',
      plan,
    };
  }

  const fallbackMessages = buildLegacyMessages(userInput, chartType);
  const fallbackResponse = await callLLM(config, fallbackMessages);
  const parsedFallback = parseModelJson(fallbackResponse);
  if (parsedFallback.ok && Array.isArray(parsedFallback.value)) {
    return {
      elements: finalizeElementArray(parsedFallback.value, chartType),
      diagramType: chartType,
      mode: 'legacy-fallback',
    };
  }

  throw new Error('The model did not return a usable diagram plan or element array.');
}

function buildPlanMessages(userInput, chartType) {
  return [
    { role: 'system', content: PLAN_SYSTEM_PROMPT },
    buildUserMessage(userInput, buildPlanUserPrompt(userInput, chartType)),
  ];
}

function buildLegacyMessages(userInput, chartType) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    buildUserMessage(userInput, USER_PROMPT_TEMPLATE(typeof userInput === 'object' ? userInput.text || '' : userInput, chartType)),
  ];
}

function buildUserMessage(userInput, content) {
  if (typeof userInput === 'object' && userInput?.image) {
    return {
      role: 'user',
      content,
      image: {
        data: userInput.image.data,
        mimeType: userInput.image.mimeType,
      },
    };
  }

  return {
    role: 'user',
    content,
  };
}

function buildPlanUserPrompt(userInput, chartType) {
  const textInput = typeof userInput === 'object' ? userInput.text || 'Generate a diagram from this image' : userInput;
  const chartInstruction = chartType
    ? `Requested chart type: ${chartType}. You must keep the plan faithful to that exact chart type and its conventions.`
    : 'Choose the most appropriate diagram type for the content.';
  const chartSpecificInstruction = buildChartSpecificPlanInstruction(chartType);

  return [
    chartInstruction,
    chartSpecificInstruction,
    'Create a semantic diagram plan for the following input.',
    'Keep the structure readable and useful after deterministic rendering, but preserve important detail from the source instead of collapsing it into generic placeholders.',
    'If the input is text-heavy, keep the major sections, named concepts, important facts, and supporting details that make the diagram informative on its own.',
    `User input:\n${textInput}`,
  ].join('\n\n');
}

function parseModelJson(rawText) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return { ok: false, error: 'Empty model response' };
  }

  const trimmed = stripCodeFences(rawText);
  const directParse = safeParseJsonWithRepair(trimmed);
  if (directParse.ok) {
    return directParse;
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const arrayParse = safeParseJsonWithRepair(arrayMatch[0]);
    if (arrayParse.ok) return arrayParse;
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const objectParse = safeParseJsonWithRepair(objectMatch[0]);
    if (objectParse.ok) return objectParse;
  }

  return directParse;
}

function buildChartSpecificPlanInstruction(chartType) {
  switch (chartType) {
    case 'pyramid':
      return 'For pyramid charts, preserve each major tier or level as its own node. If the text contains numbered tiers, sections, or ranked levels, create one node per tier and keep the tier-specific facts in details.';
    case 'funnel':
      return 'For funnel charts, preserve each stage as its own node. If the text contains numbered stages or conversion steps, create one node per stage and keep the stage-specific facts in details.';
    default:
      return 'Preserve the important structural units of the source material.';
  }
}

function stripCodeFences(value) {
  return value
    .trim()
    .replace(/^```(?:json|javascript|js)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

export function normalizeDiagramPlan(rawPlan, requestedType = 'flowchart') {
  const sections = normalizeSections(rawPlan.sections);
  const normalizedType = sanitizeDiagramType(requestedType, sanitizeDiagramType(rawPlan.diagramType, inferDiagramType(rawPlan, sections)));

  const nodesResult = normalizeNodes(rawPlan.nodes, sections);
  if (normalizedType === 'sequence') {
    ensureSequenceParticipants(nodesResult, sections);
  }
  nodesResult.nodes = applyChartTypeNodeSemantics(nodesResult.nodes, normalizedType);
  const edges = normalizeEdges(rawPlan.edges, nodesResult.aliases);
  const mergedEdges = edges.length > 0 ? edges : deriveParentEdges(nodesResult.nodes);
  const enrichedSections = applyChartTypeSectionSemantics(attachSectionItems(sections, nodesResult.nodes), normalizedType);

  const title = asCleanString(rawPlan.title) || defaultTitleForType(normalizedType);
  const summary = asCleanString(rawPlan.summary);

  const nodes = nodesResult.nodes.length > 0
    ? nodesResult.nodes
    : [
        {
          id: 'main-topic',
          label: title,
          kind: normalizedType === 'mindmap' ? 'event' : 'process',
          sectionId: undefined,
          details: summary ? [summary] : [],
          parentId: undefined,
        },
      ];

  return {
    title,
    summary,
    diagramType: normalizedType,
    sections: enrichedSections,
    nodes,
    edges: mergedEdges,
  };
}

export function enrichDiagramPlanFromInput(plan, userInput, requestedType) {
  const textInput = typeof userInput === 'object' ? userInput?.text || '' : userInput || '';
  if (!textInput.trim()) {
    return plan;
  }

  if (requestedType === 'pyramid' || requestedType === 'funnel' || plan.diagramType === 'pyramid' || plan.diagramType === 'funnel') {
    return enrichTieredShapePlanFromText(plan, textInput);
  }

  return plan;
}

function enrichTieredShapePlanFromText(plan, textInput) {
  const extractedNodes = extractTierNodesFromText(textInput);
  const existingItemCount = Math.max(plan.sections.length, plan.nodes.length);

  if (extractedNodes.length < 2 || existingItemCount >= extractedNodes.length) {
    return plan;
  }

  return {
    ...plan,
    nodes: extractedNodes,
    sections: [],
    edges: [],
  };
}

function extractTierNodesFromText(textInput) {
  const normalizedText = textInput.replace(/\r\n/g, '\n').trim();
  if (!normalizedText) return [];

  const numberedMatches = [...normalizedText.matchAll(/(?:^|\n)\s*(\d+)\.\s+([^\n]+)([\s\S]*?)(?=(?:\n\s*\d+\.\s+[^\n]+)|$)/g)];
  if (numberedMatches.length >= 2) {
    return numberedMatches
      .map((match, index) => {
        const heading = cleanLabel(match[2]);
        const body = (match[3] || '').trim();
        const details = extractTierDetails(body);
        if (!heading) return null;

        return {
          id: slugify(heading) || `tier-${index + 1}`,
          label: heading,
          kind: 'process',
          sectionId: undefined,
          details,
          parentId: undefined,
        };
      })
      .filter(Boolean);
  }

  return [];
}

function extractTierDetails(body) {
  if (!body) return [];

  return body
    .split(/\n+/)
    .map((line) => cleanLabel(line.replace(/^[-*•]\s*/, '')))
    .filter(Boolean)
    .flatMap((line) => line.split(/(?<=\.)\s+(?=[A-Z])|(?<=:)\s+(?=[A-Z])|;\s+/))
    .map((line) => cleanLabel(line))
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeSections(rawSections) {
  if (!Array.isArray(rawSections)) return [];

  const usedIds = new Set();
  return rawSections
    .map((section, index) => {
      if (typeof section === 'string') {
        const title = cleanLabel(section);
        if (!title) return null;
        return {
          id: uniqueId(slugify(title) || `section-${index + 1}`, usedIds),
          title,
          kind: 'frame',
          items: [],
        };
      }

      if (!section || typeof section !== 'object') return null;

      const title = cleanLabel(section.title || section.label || section.name);
      if (!title) return null;

      return {
        id: uniqueId(slugify(section.id || title) || `section-${index + 1}`, usedIds),
        title,
        kind: normalizeSectionKind(section.kind),
        items: Array.isArray(section.items) ? section.items.map((item) => asCleanString(item)).filter(Boolean) : [],
      };
    })
    .filter(Boolean);
}

function normalizeNodes(rawNodes, sections) {
  const sectionIds = new Set(sections.map((section) => section.id));
  const nodes = [];
  const aliases = new Map();
  const usedIds = new Set();

  if (!Array.isArray(rawNodes)) {
    return { nodes, aliases };
  }

  rawNodes.forEach((node, index) => {
    if (!node || typeof node !== 'object') return;

    const label = cleanLabel(node.label || node.title || node.name || node.text);
    if (!label) return;

    const id = uniqueId(slugify(node.id || label) || `node-${index + 1}`, usedIds);
    const kind = normalizeKind(node.kind || node.role || node.type || inferKindFromLabel(label));
    const details = normalizeDetails(node.details || node.bullets || node.notes || node.description);
    const rawSectionId = asCleanString(node.sectionId || node.section || node.group);
    const sectionId = rawSectionId
      ? resolveSectionId(rawSectionId, sections, sectionIds)
      : undefined;
    const rawParentId = asCleanString(node.parentId || node.parent);

    aliases.set(id, id);
    aliases.set(label.toLowerCase(), id);
    if (node.id) aliases.set(String(node.id).trim().toLowerCase(), id);

    nodes.push({
      id,
      label,
      kind,
      sectionId,
      details,
      parentId: rawParentId ? rawParentId.trim() : undefined,
    });
  });

  nodes.forEach((node) => {
    if (!node.parentId) return;
    const resolvedParentId = aliases.get(node.parentId.toLowerCase());
    node.parentId = resolvedParentId && resolvedParentId !== node.id ? resolvedParentId : undefined;
  });

  return { nodes, aliases };
}

function normalizeEdges(rawEdges, aliases) {
  if (!Array.isArray(rawEdges)) return [];

  const seen = new Set();
  return rawEdges
    .map((edge) => {
      if (!edge || typeof edge !== 'object') return null;

      const fromToken = asCleanString(edge.from || edge.source || edge.start);
      const toToken = asCleanString(edge.to || edge.target || edge.end);
      if (!fromToken || !toToken) return null;

      const from = aliases.get(fromToken.toLowerCase()) || aliases.get(slugify(fromToken)) || fromToken;
      const to = aliases.get(toToken.toLowerCase()) || aliases.get(slugify(toToken)) || toToken;
      if (!from || !to || from === to) return null;

      const key = `${from}->${to}:${asCleanString(edge.label) || ''}`;
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        from,
        to,
        label: cleanLabel(edge.label),
        style: edge.style === 'dashed' ? 'dashed' : 'solid',
      };
    })
    .filter(Boolean);
}

function deriveParentEdges(nodes) {
  return nodes
    .filter((node) => node.parentId)
    .map((node) => ({
      from: node.parentId,
      to: node.id,
      label: '',
      style: 'solid',
    }));
}

function attachSectionItems(sections, nodes) {
  const nextSections = sections.map((section) => ({ ...section, items: [...section.items] }));
  const sectionById = new Map(nextSections.map((section) => [section.id, section]));

  nodes.forEach((node) => {
    if (!node.sectionId) return;

    if (!sectionById.has(node.sectionId)) {
      const title = titleCase(node.sectionId.replace(/[-_]+/g, ' '));
      const created = { id: node.sectionId, title, kind: 'frame', items: [] };
      nextSections.push(created);
      sectionById.set(created.id, created);
    }

    const section = sectionById.get(node.sectionId);
    if (!section.items.includes(node.id)) {
      section.items.push(node.id);
    }
  });

  return nextSections;
}

function inferDiagramType(rawPlan, sections) {
  const rawType = sanitizeDiagramType(rawPlan.diagramType, '');
  if (rawType) return rawType;

  const sectionTitles = sections.map((section) => section.title.toLowerCase());
  if (sectionTitles.some((title) => title.includes('strength')) && sectionTitles.some((title) => title.includes('weak'))) {
    return 'swot';
  }

  const nodes = Array.isArray(rawPlan.nodes) ? rawPlan.nodes : [];
  const edges = Array.isArray(rawPlan.edges) ? rawPlan.edges : [];
  const kinds = nodes.map((node) => normalizeKind(node?.kind || node?.type || node?.role)).filter(Boolean);

  if (kinds.includes('participant')) return 'sequence';
  if (sectionTitles.some((title) => title.includes('lane'))) return 'swimlane';
  if (kinds.includes('database') && kinds.includes('service')) return 'architecture';
  if (kinds.includes('entity') && kinds.includes('attribute')) return 'er';
  if (kinds.includes('class')) return 'class';
  if (edges.length === 0 && sections.length >= 4) return 'matrix';

  return 'flowchart';
}

export function renderDiagramPlan(plan) {
  switch (plan.diagramType) {
    case 'flowchart':
      return renderFlowchartDiagram(plan);
    case 'orgchart':
      return renderOrgChartDiagram(plan);
    case 'class':
      return renderClassDiagram(plan);
    case 'er':
      return renderERDiagram(plan);
    case 'gantt':
      return renderGanttDiagram(plan);
    case 'tree':
      return renderTreeDiagram(plan);
    case 'network':
      if (plan.sections.length > 0) {
        return renderNetworkSectionedDiagram(plan);
      }
      return renderStructuredDiagram(plan);
    case 'architecture':
      return renderArchitectureDiagram(plan);
    case 'dataflow':
      return renderDataflowDiagram(plan);
    case 'state':
      return renderStateDiagram(plan);
    case 'swimlane':
      return renderSwimlaneDiagram(plan);
    case 'mindmap':
      return renderMindmapDiagram(plan);
    case 'concept':
      return renderConceptDiagram(plan);
    case 'fishbone':
      return renderFishboneDiagram(plan);
    case 'sequence':
      return renderSequenceDiagram(plan);
    case 'swot':
    case 'matrix':
      return renderQuadrantDiagram(plan);
    case 'timeline':
      return renderTimelineDiagram(plan);
    case 'pyramid':
      return renderPyramidDiagram(plan);
    case 'funnel':
      return renderFunnelDiagram(plan);
    case 'venn':
      return renderVennDiagram(plan);
    case 'infographic':
      return renderInfographicDiagram(plan);
    default:
      if (plan.sections.length > 0) {
        return renderSectionedDiagram(plan);
      }
      return renderStructuredDiagram(plan);
  }
}

function renderSectionedDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const sectionLayouts = buildSectionLayouts(plan, measuredNodes);
  const nodePositions = new Map();
  const orphanNodes = plan.nodes.filter((node) => !node.sectionId || !sectionLayouts.byId.has(node.sectionId));

  if (plan.title) {
    elements.push({
      id: 'diagram-title',
      type: 'text',
      x: 100,
      y: 20,
      text: plan.title,
      fontSize: 28,
      strokeColor: '#173038',
      groupIds: ['meta-title'],
    });
  }

  sectionLayouts.ordered.forEach((layout) => {
    elements.push({
      id: `section-bg-${layout.section.id}`,
      type: 'rectangle',
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      strokeColor: '#cbd5e1',
      backgroundColor: '#f8fafc',
      roundness: 16,
      opacity: 60,
    });

    elements.push({
      id: `section-title-${layout.section.id}`,
      type: 'text',
      x: layout.x + 16,
      y: layout.y + 14,
      text: layout.section.title,
      fontSize: 16,
      strokeColor: '#64748b',
      groupIds: [`section-${layout.section.id}`],
    });

    layout.items.forEach((item) => {
      nodePositions.set(item.node.id, { x: item.x, y: item.y });
    });
  });

  if (orphanNodes.length > 0) {
    positionOrphanNodes(orphanNodes, plan, measuredNodes, nodePositions, sectionLayouts);
  }

  const renderedNodes = plan.nodes.map((node) => {
    const position = nodePositions.get(node.id) || { x: 120, y: 140 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });
  const nodeElements = renderedNodes.flatMap((entry) => entry.elements);
  const edgeAnchors = renderedNodes.map((entry) => entry.anchor);

  const arrows = buildEdgeElements(plan, edgeAnchors);
  return [...elements, ...nodeElements, ...arrows];
}

function renderNetworkSectionedDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const sectionLayouts = buildNetworkSectionLayouts(plan, measuredNodes);
  const nodePositions = new Map();
  const orphanNodes = plan.nodes.filter((node) => !node.sectionId || !sectionLayouts.byId.has(node.sectionId));

  if (plan.title) {
    elements.push({
      id: 'diagram-title',
      type: 'text',
      x: 100,
      y: 20,
      text: plan.title,
      fontSize: 28,
      strokeColor: '#173038',
      groupIds: ['meta-title'],
    });
  }

  sectionLayouts.ordered.forEach((layout) => {
    elements.push({
      id: `section-bg-${layout.section.id}`,
      type: 'ellipse',
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      strokeColor: '#111827',
      backgroundColor: '#ffffff',
      strokeWidth: 3,
      opacity: 30,
    });

    elements.push({
      id: `section-title-${layout.section.id}`,
      type: 'text',
      x: layout.x + 28,
      y: layout.y + 16,
      text: layout.section.title,
      fontSize: 18,
      strokeColor: '#111827',
      groupIds: [`section-${layout.section.id}`],
    });

    layout.items.forEach((item) => {
      nodePositions.set(item.node.id, { x: item.x, y: item.y });
    });
  });

  if (orphanNodes.length > 0) {
    positionOrphanNodes(orphanNodes, plan, measuredNodes, nodePositions, sectionLayouts);
  }

  const renderedNodes = plan.nodes.map((node) => {
    const position = nodePositions.get(node.id) || { x: 120, y: 140 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });
  const nodeElements = renderedNodes.flatMap((entry) => entry.elements);
  const edgeAnchors = renderedNodes.map((entry) => entry.anchor);
  const arrows = buildEdgeElements(plan, edgeAnchors);

  return [...elements, ...nodeElements, ...arrows];
}

function renderStructuredDiagram(plan) {
  const nodes = plan.nodes;
  const nodeElements = [];
  const frames = [];
  const positionMap = createInitialNodePositions(plan);
  const sectionChildren = new Map(plan.sections.map((section) => [section.id, []]));

  if (plan.title) {
    nodeElements.push({
      id: 'diagram-title',
      type: 'text',
      x: 100,
      y: 20,
      text: plan.title,
      fontSize: 28,
      strokeColor: '#173038',
      groupIds: ['meta-title'],
    });
  }

  nodes.forEach((node) => {
    const position = positionMap.get(node.id) || { x: 100, y: 100 };
    const rendered = createRenderedNode(node, position.x, position.y, plan.diagramType);
    nodeElements.push(...rendered.elements);

    if (node.sectionId && sectionChildren.has(node.sectionId)) {
      sectionChildren.get(node.sectionId).push(...rendered.elements.map((element) => element.id));
    }
  });

  plan.sections.forEach((section) => {
    const children = sectionChildren.get(section.id) || [];
    if (children.length === 0) return;

    frames.push({
      id: `frame-${section.id}`,
      type: 'frame',
      name: section.title,
      children,
    });
  });

  const edgeAnchors = nodeElements.filter((element) => plan.nodes.some((node) => node.id === element.id));
  const arrows = buildEdgeElements(plan, edgeAnchors);

  return [...nodeElements, ...arrows, ...frames];
}

function renderSequenceDiagram(plan) {
  const elements = [];
  const participants = deriveSequenceParticipants(plan);
  const topY = 100;
  const messageStartY = 210;
  const laneWidth = 240;
  const lifelineHeight = Math.max(260, plan.edges.length * 90 + 80);
  const participantCenters = new Map();

  if (plan.title) {
    elements.push({
      id: 'diagram-title',
      type: 'text',
      x: 100,
      y: 20,
      text: plan.title,
      fontSize: 28,
      strokeColor: '#173038',
      groupIds: ['meta-title'],
    });
  }

  participants.forEach((participant, index) => {
    const x = 100 + index * laneWidth;
    const width = 180;
    const height = 64;
    elements.push({
      id: participant.id,
      type: 'rectangle',
      x,
      y: topY,
      width,
      height,
      strokeColor: '#5b5f97',
      backgroundColor: '#f0ecff',
      label: { text: participant.label, fontSize: 17 },
    });

    participantCenters.set(participant.id, x + width / 2);

    elements.push({
      id: `lifeline-${participant.id}`,
      type: 'line',
      x: x + width / 2,
      y: topY + height,
      width: 0,
      height: lifelineHeight,
      strokeColor: '#94a3b8',
      strokeStyle: 'dashed',
    });
  });

  plan.edges.forEach((edge, index) => {
    const startX = participantCenters.get(edge.from);
    const endX = participantCenters.get(edge.to);
    if (!Number.isFinite(startX) || !Number.isFinite(endX)) return;

    const y = messageStartY + index * 90;
    const width = endX - startX;
    const arrow = {
      id: `message-${index + 1}`,
      type: 'arrow',
      x: startX,
      y,
      width: width === 0 ? 90 : width,
      height: width === 0 ? 45 : 0,
      strokeColor: '#355070',
      label: edge.label ? { text: edge.label, fontSize: 12 } : undefined,
    };

    if (width === 0) {
      arrow.elbowed = true;
    }

    elements.push(arrow);
  });

  return elements;
}

function renderQuadrantDiagram(plan) {
  const elements = [];
  const quadrants = buildQuadrants(plan);
  const width = 360;
  const height = 240;
  const gapX = 70;
  const gapY = 70;

  if (plan.title) {
    elements.push({
      id: 'diagram-title',
      type: 'text',
      x: 100,
      y: 20,
      text: plan.title,
      fontSize: 28,
      strokeColor: '#173038',
      groupIds: ['meta-title'],
    });
  }

  quadrants.forEach((quadrant, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const x = 100 + col * (width + gapX);
    const y = 110 + row * (height + gapY);
    const children = [];

    elements.push({
      id: quadrant.id,
      type: 'rectangle',
      x,
      y,
      width,
      height,
      strokeColor: quadrant.strokeColor,
      backgroundColor: quadrant.backgroundColor,
      label: { text: quadrant.title, fontSize: 18, verticalAlign: 'top' },
    });

    quadrant.items.forEach((node, nodeIndex) => {
      const cardY = y + 58 + nodeIndex * 72;
      const cardId = `${quadrant.id}-item-${nodeIndex + 1}`;
      children.push(cardId);
      elements.push({
        id: cardId,
        type: 'rectangle',
        x: x + 24,
        y: cardY,
        width: width - 48,
        height: 56,
        strokeColor: '#94a3b8',
        backgroundColor: '#ffffff',
        label: { text: buildNodeLabel(node), fontSize: 15, textAlign: 'left', verticalAlign: 'middle' },
      });
    });
  });

  return elements;
}

function renderTimelineDiagram(plan) {
  const elements = [];
  const timelineNodes = [...plan.nodes];
  const axisY = 240;
  const stepX = 260;

  if (plan.title) {
    elements.push({
      id: 'diagram-title',
      type: 'text',
      x: 100,
      y: 20,
      text: plan.title,
      fontSize: 28,
      strokeColor: '#173038',
      groupIds: ['meta-title'],
    });
  }

  elements.push({
    id: 'timeline-axis',
    type: 'line',
    x: 120,
    y: axisY,
    width: Math.max(300, (timelineNodes.length - 1) * stepX),
    height: 0,
    strokeColor: '#64748b',
  });

  timelineNodes.forEach((node, index) => {
    const x = 120 + index * stepX;
    const cardY = index % 2 === 0 ? 120 : 300;
    const cardId = `timeline-card-${node.id}`;

    elements.push({
      id: `timeline-point-${node.id}`,
      type: 'ellipse',
      x: x - 18,
      y: axisY - 18,
      width: 36,
      height: 36,
      strokeColor: '#355070',
      backgroundColor: '#dbeafe',
      label: { text: '', fontSize: 1 },
    });

    elements.push({
      id: cardId,
      type: 'rectangle',
      x: x - 90,
      y: cardY,
      width: 200,
      height: 90,
      strokeColor: '#355070',
      backgroundColor: '#f8fafc',
      label: { text: buildNodeLabel(node), fontSize: 15 },
    });

    elements.push({
      id: `timeline-connector-${node.id}`,
      type: 'line',
      x,
      y: cardY < axisY ? cardY + 90 : axisY,
      width: 0,
      height: cardY < axisY ? axisY - (cardY + 90) : cardY - axisY,
      strokeColor: '#94a3b8',
      strokeStyle: 'dashed',
    });
  });

  return elements;
}

function renderFlowchartDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const positions = buildLayerPositions(plan.nodes, plan.edges, measuredNodes, {
    orientation: 'TB',
    startX: 120,
    startY: 120,
    layerGap: 170,
    nodeGap: 80,
  });

  pushDiagramTitle(elements, plan.title);
  const renderedNodes = plan.nodes.map((node) => {
    const position = positions.get(node.id) || { x: 120, y: 120 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });

  const anchors = renderedNodes.map((entry) => entry.anchor);
  return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
}

function renderOrgChartDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const positions = buildLayerPositions(plan.nodes, plan.edges, measuredNodes, {
    orientation: 'TB',
    startX: 160,
    startY: 120,
    layerGap: 190,
    nodeGap: 90,
  });

  pushDiagramTitle(elements, plan.title);
  const renderedNodes = plan.nodes.map((node) => {
    const position = positions.get(node.id) || { x: 160, y: 120 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });

  const anchors = renderedNodes.map((entry) => entry.anchor);
  return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
}

function renderArchitectureDiagram(plan) {
  return renderColumnSectionDiagram(plan, {
    fill: '#f8fafc',
    stroke: '#94a3b8',
    titleColor: '#334155',
    emptyOrientation: 'LR',
  });
}

function renderDataflowDiagram(plan) {
  return renderColumnSectionDiagram(plan, {
    fill: '#ecfeff',
    stroke: '#0891b2',
    titleColor: '#155e75',
    emptyOrientation: 'LR',
  });
}

function renderStateDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const positions = buildLayerPositions(plan.nodes, plan.edges, measuredNodes, {
    orientation: 'LR',
    startX: 160,
    startY: 140,
    layerGap: 260,
    nodeGap: 70,
  });

  pushDiagramTitle(elements, plan.title);
  const renderedNodes = plan.nodes.map((node) => {
    const position = positions.get(node.id) || { x: 160, y: 140 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });

  const anchors = renderedNodes.map((entry) => entry.anchor);
  return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
}

function renderSwimlaneDiagram(plan) {
  if (plan.sections.length === 0) {
    return renderFlowchartDiagram(plan);
  }

  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const layers = assignLayers(plan.nodes, plan.edges);
  const maxLayer = Math.max(...[...layers.values()], 0);
  const laneHeight = 180;
  const laneX = 140;
  const laneTitleWidth = 170;
  const laneWidth = laneTitleWidth + 100 + maxLayer * 240 + 260;
  const nodePositions = new Map();
  const nodesByLaneLayer = new Map();

  pushDiagramTitle(elements, plan.title);

  plan.nodes.forEach((node) => {
    const laneKey = node.sectionId || 'unassigned';
    const layer = layers.get(node.id) || 0;
    const compound = `${laneKey}:${layer}`;
    if (!nodesByLaneLayer.has(compound)) nodesByLaneLayer.set(compound, []);
    nodesByLaneLayer.get(compound).push(node);
  });

  plan.sections.forEach((section, laneIndex) => {
    const laneY = 110 + laneIndex * (laneHeight + 26);
    elements.push({
      id: `lane-bg-${section.id}`,
      type: 'rectangle',
      x: laneX,
      y: laneY,
      width: laneWidth,
      height: laneHeight,
      strokeColor: '#94a3b8',
      backgroundColor: laneIndex % 2 === 0 ? '#f8fafc' : '#eef2ff',
      roundness: 14,
      opacity: 70,
    });

    elements.push({
      id: `lane-title-${section.id}`,
      type: 'text',
      x: laneX + 18,
      y: laneY + 20,
      text: section.title,
      fontSize: 18,
      strokeColor: '#334155',
    });

    elements.push({
      id: `lane-divider-${section.id}`,
      type: 'line',
      x: laneX + laneTitleWidth,
      y: laneY + 8,
      width: 0,
      height: laneHeight - 16,
      strokeColor: '#cbd5e1',
      strokeStyle: 'dashed',
    });

    for (let layer = 0; layer <= maxLayer; layer += 1) {
      const bucket = nodesByLaneLayer.get(`${section.id}:${layer}`) || [];
      bucket.forEach((node, index) => {
        const measured = measuredNodes.get(node.id);
        const x = laneX + laneTitleWidth + 56 + layer * 240;
        const y = laneY + 42 + index * ((measured?.height || 72) + 16);
        nodePositions.set(node.id, { x, y });
      });
    }
  });

  const renderedNodes = plan.nodes.map((node) => {
    const position = nodePositions.get(node.id) || { x: laneX + laneTitleWidth + 56, y: 140 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });

  const anchors = renderedNodes.map((entry) => entry.anchor);
  return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
}

function renderMindmapDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const root = chooseHubNode(plan.nodes, plan.edges);
  const positions = buildRadialPositions(plan.nodes, plan.edges, measuredNodes, root?.id, {
    centerX: 760,
    centerY: 420,
    outerRadiusX: 380,
    outerRadiusY: 250,
    childRadius: 160,
  });

  pushDiagramTitle(elements, plan.title);
  const renderedNodes = plan.nodes.map((node) => {
    const position = positions.get(node.id) || { x: 680, y: 390 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });

  const anchors = renderedNodes.map((entry) => entry.anchor);
  return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
}

function renderConceptDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const root = chooseHubNode(plan.nodes, plan.edges);
  const positions = buildRadialPositions(plan.nodes, plan.edges, measuredNodes, root?.id, {
    centerX: 760,
    centerY: 420,
    outerRadiusX: 430,
    outerRadiusY: 280,
    childRadius: 190,
  });

  pushDiagramTitle(elements, plan.title);
  const renderedNodes = plan.nodes.map((node) => {
    const position = positions.get(node.id) || { x: 680, y: 390 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });

  const anchors = renderedNodes.map((entry) => entry.anchor);
  return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
}

function renderTreeDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const positions = buildLayerPositions(plan.nodes, plan.edges, measuredNodes, {
    orientation: 'TB',
    startX: 140,
    startY: 120,
    layerGap: 190,
    nodeGap: 70,
  });

  pushDiagramTitle(elements, plan.title);
  const renderedNodes = plan.nodes.map((node) => {
    const position = positions.get(node.id) || { x: 140, y: 120 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });

  const anchors = renderedNodes.map((entry) => entry.anchor);
  return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
}

function renderFishboneDiagram(plan) {
  const elements = [];
  const headNode = chooseHubNode(plan.nodes, plan.edges) || plan.nodes[0];
  const causeNodes = plan.nodes.filter((node) => node.id !== headNode?.id);
  const headX = 1220;
  const spineY = 390;
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);

  pushDiagramTitle(elements, plan.title);

  elements.push({
    id: 'fishbone-spine',
    type: 'arrow',
    x: 220,
    y: spineY,
    width: headX - 220,
    height: 0,
    strokeColor: '#334155',
  });

  const anchors = [];
  if (headNode) {
    const headMeasured = measuredNodes.get(headNode.id);
    const headAnchor = createNodeElement(
      headNode,
      headX - Math.round((headMeasured?.width || 220) / 2),
      spineY - Math.round((headMeasured?.height || 90) / 2),
      plan.diagramType,
      headMeasured
    );
    anchors.push(headAnchor);
    elements.push(headAnchor);
  }

  causeNodes.forEach((node, index) => {
    const measured = measuredNodes.get(node.id);
    const branchX = 360 + index * 170;
    const above = index % 2 === 0;
    const nodeX = branchX - 110;
    const nodeY = above ? spineY - 170 : spineY + 100;
    const branchY = above ? nodeY + (measured?.height || 72) : nodeY;

    elements.push({
      id: `fishbone-branch-${node.id}`,
      type: 'line',
      x: branchX,
      y: spineY,
      width: 120,
      height: above ? -120 : 120,
      strokeColor: '#64748b',
    });

    const rendered = createRenderedNode(node, nodeX, nodeY, plan.diagramType, measured);
    anchors.push(rendered.anchor);
    elements.push(...rendered.elements);
  });

  return elements;
}

function renderClassDiagram(plan) {
  const elements = [];
  const measuredNodes = new Map(plan.nodes.map((node) => [node.id, measureClassNode(node)]));
  const positions = buildLayerPositions(plan.nodes, plan.edges, measuredNodes, {
    orientation: 'LR',
    startX: 160,
    startY: 140,
    layerGap: 320,
    nodeGap: 80,
  });

  pushDiagramTitle(elements, plan.title);
  const anchors = [];

  plan.nodes.forEach((node) => {
    const measured = measuredNodes.get(node.id);
    const position = positions.get(node.id) || { x: 160, y: 140 };
    const rendered = createRenderedClassNode(node, position.x, position.y, measured);
    anchors.push(rendered.anchor);
    elements.push(...rendered.elements);
  });

  return [...elements, ...buildEdgeElements(plan, anchors)];
}

function renderERDiagram(plan) {
  const elements = [];
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const attributeNodes = plan.nodes.filter((node) => node.kind === 'attribute');
  const coreNodes = plan.nodes.filter((node) => node.kind !== 'attribute');
  const coreEdges = plan.edges.filter((edge) => {
    const fromNode = plan.nodes.find((node) => node.id === edge.from);
    const toNode = plan.nodes.find((node) => node.id === edge.to);
    return fromNode?.kind !== 'attribute' && toNode?.kind !== 'attribute';
  });
  const positions = buildLayerPositions(coreNodes, coreEdges, measuredNodes, {
    orientation: 'LR',
    startX: 180,
    startY: 180,
    layerGap: 340,
    nodeGap: 100,
  });

  pushDiagramTitle(elements, plan.title);
  const anchors = [];

  coreNodes.forEach((node) => {
    const position = positions.get(node.id) || { x: 180, y: 180 };
    const rendered = createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
    anchors.push(rendered.anchor);
    elements.push(...rendered.elements);
  });

  attributeNodes.forEach((node, index) => {
    const host = resolveAttributeHost(node, plan);
    const hostAnchor = anchors.find((anchor) => anchor.id === host?.id) || anchors[index % Math.max(anchors.length, 1)];
    const measured = measuredNodes.get(node.id);
    const angle = (index % 6) * (Math.PI / 3);
    const radiusX = 180;
    const radiusY = 120;
    const x = (hostAnchor?.x || 220) + Math.round(Math.cos(angle) * radiusX);
    const y = (hostAnchor?.y || 220) + Math.round(Math.sin(angle) * radiusY);
    const rendered = createRenderedNode(node, x, y, plan.diagramType, measured);
    anchors.push(rendered.anchor);
    elements.push(...rendered.elements);
    if (hostAnchor) {
      elements.push({
        id: `attribute-link-${node.id}`,
        type: 'line',
        x: hostAnchor.x + Math.round((hostAnchor.width || 200) / 2),
        y: hostAnchor.y + Math.round((hostAnchor.height || 80) / 2),
        width: x - (hostAnchor.x + Math.round((hostAnchor.width || 200) / 2)),
        height: y - (hostAnchor.y + Math.round((hostAnchor.height || 80) / 2)),
        strokeColor: '#64748b',
      });
    }
  });

  return [...elements, ...buildEdgeElements({ ...plan, edges: coreEdges }, anchors)];
}

function renderGanttDiagram(plan) {
  const elements = [];
  const tasks = plan.nodes;
  const taskLabelWidth = 240;
  const cellWidth = 120;
  const rowHeight = 64;
  const headerY = 120;
  const startX = 120;
  const timelineColumns = Math.max(6, Math.min(10, tasks.length + 2));

  pushDiagramTitle(elements, plan.title);

  for (let column = 0; column < timelineColumns; column += 1) {
    const x = startX + taskLabelWidth + column * cellWidth;
    elements.push({
      id: `gantt-col-${column + 1}`,
      type: 'rectangle',
      x,
      y: headerY,
      width: cellWidth,
      height: 42,
      strokeColor: '#cbd5e1',
      backgroundColor: '#f8fafc',
      label: { text: `Phase ${column + 1}`, fontSize: 14 },
    });
  }

  tasks.forEach((task, index) => {
    const y = headerY + 54 + index * rowHeight;
    const start = index % Math.max(2, timelineColumns - 3);
    const duration = Math.max(2, Math.min(4, 2 + (task.details.length % 3)));

    elements.push({
      id: `gantt-task-${task.id}`,
      type: 'rectangle',
      x: startX,
      y,
      width: taskLabelWidth - 20,
      height: 48,
      strokeColor: '#94a3b8',
      backgroundColor: '#ffffff',
      label: { text: task.label, fontSize: 15, textAlign: 'left' },
    });

    elements.push({
      id: task.id,
      type: 'rectangle',
      x: startX + taskLabelWidth + start * cellWidth + 8,
      y: y + 8,
      width: duration * cellWidth - 16,
      height: 32,
      strokeColor: '#0f766e',
      backgroundColor: '#99f6e4',
      label: { text: task.details[0] || '', fontSize: 13 },
    });
  });

  return elements;
}

function renderPyramidDiagram(plan) {
  const elements = [];
  const items = getShapeDiagramItems(plan);
  const baseWidth = 620;
  const stepHeight = 108;
  const centerX = 760;

  pushDiagramTitle(elements, plan.title);

  items.forEach((item, index) => {
    const labelText = buildShapeItemLabel(item, 3);
    const lines = labelText.split('\n').length;
    const height = Math.max(stepHeight - 12, 34 + lines * 20);
    const width = baseWidth - index * 90;
    const x = centerX - width / 2;
    const y = 160 + (items.length - index - 1) * stepHeight;
    elements.push({
      id: item.id,
      type: 'rectangle',
      x,
      y,
      width,
      height,
      strokeColor: '#1d4ed8',
      backgroundColor: ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa'][index % 4],
      label: { text: labelText, fontSize: lines > 3 ? 14 : 16 },
    });
  });

  return elements;
}

function renderFunnelDiagram(plan) {
  const elements = [];
  const items = getShapeDiagramItems(plan);
  const topWidth = 720;
  const stepHeight = 112;
  const centerX = 760;

  pushDiagramTitle(elements, plan.title);

  items.forEach((item, index) => {
    const labelText = buildShapeItemLabel(item, 3);
    const lines = labelText.split('\n').length;
    const height = Math.max(stepHeight - 10, 34 + lines * 20);
    const width = topWidth - index * 100;
    const x = centerX - width / 2;
    const y = 160 + index * stepHeight;
    elements.push({
      id: item.id,
      type: 'rectangle',
      x,
      y,
      width,
      height,
      strokeColor: '#c2410c',
      backgroundColor: ['#ffedd5', '#fed7aa', '#fdba74', '#fb923c'][index % 4],
      label: { text: labelText, fontSize: lines > 3 ? 14 : 16 },
    });
  });

  return elements;
}

function renderVennDiagram(plan) {
  const elements = [];
  const items = getShapeDiagramItems(plan).slice(0, 3);
  const circles = [
    { x: 430, y: 220, color: '#93c5fd' },
    { x: 670, y: 220, color: '#fca5a5' },
    { x: 550, y: 380, color: '#86efac' },
  ];

  pushDiagramTitle(elements, plan.title);

  items.forEach((item, index) => {
    const circle = circles[index];
    elements.push({
      id: item.id,
      type: 'ellipse',
      x: circle.x,
      y: circle.y,
      width: 360,
      height: 250,
      strokeColor: '#334155',
      backgroundColor: circle.color,
      opacity: 45,
      label: { text: item.label, fontSize: 18, verticalAlign: 'top' },
    });
  });

  if (plan.summary) {
    elements.push({
      id: 'venn-center-note',
      type: 'text',
      x: 600,
      y: 350,
      text: plan.summary,
      fontSize: 16,
      strokeColor: '#0f172a',
    });
  }

  return elements;
}

function renderInfographicDiagram(plan) {
  const elements = [];
  const cards = plan.nodes.slice(0, 6);

  pushDiagramTitle(elements, plan.title);

  if (cards.length > 0) {
    elements.push({
      id: `infographic-hero-${cards[0].id}`,
      type: 'rectangle',
      x: 120,
      y: 110,
      width: 520,
      height: 180,
      strokeColor: '#0891b2',
      backgroundColor: '#ecfeff',
      label: { text: buildNodeLabel(cards[0]), fontSize: 22, textAlign: 'left', verticalAlign: 'middle' },
    });
  }

  cards.slice(1).forEach((node, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    elements.push({
      id: node.id,
      type: 'rectangle',
      x: 700 + col * 280,
      y: 110 + row * 170,
      width: 240,
      height: 130,
      strokeColor: '#94a3b8',
      backgroundColor: '#ffffff',
      label: { text: buildNodeLabel(node), fontSize: 16, textAlign: 'left', verticalAlign: 'middle' },
    });
  });

  if (plan.summary) {
    elements.push({
      id: 'infographic-summary',
      type: 'rectangle',
      x: 120,
      y: 330,
      width: 520,
      height: 120,
      strokeColor: '#cbd5e1',
      backgroundColor: '#f8fafc',
      label: { text: plan.summary, fontSize: 18, textAlign: 'left', verticalAlign: 'middle' },
    });
  }

  return elements;
}

function renderColumnSectionDiagram(plan, options = {}) {
  const measuredNodes = measureNodes(plan.nodes, plan.diagramType);
  const elements = [];
  pushDiagramTitle(elements, plan.title);

  if (plan.sections.length === 0) {
    const positions = buildLayerPositions(plan.nodes, plan.edges, measuredNodes, {
      orientation: options.emptyOrientation || 'LR',
      startX: 160,
      startY: 140,
      layerGap: 280,
      nodeGap: 80,
    });
    const renderedNodes = plan.nodes.map((node) => {
      const position = positions.get(node.id) || { x: 160, y: 140 };
      return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
    });
    const anchors = renderedNodes.map((entry) => entry.anchor);
    return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
  }

  const sectionNodes = new Map(plan.sections.map((section) => [section.id, []]));
  plan.nodes.forEach((node) => {
    if (node.sectionId && sectionNodes.has(node.sectionId)) {
      sectionNodes.get(node.sectionId).push(node);
    }
  });

  const nodePositions = new Map();
  plan.sections.forEach((section, index) => {
    const nodes = sectionNodes.get(section.id) || [];
    const maxWidth = Math.max(...nodes.map((node) => measuredNodes.get(node.id)?.width || 220), 220);
    const x = 120 + index * 300;
    const y = 110;
    const width = maxWidth + 60;
    const height = Math.max(220, 84 + nodes.reduce((sum, node) => sum + (measuredNodes.get(node.id)?.height || 80) + 20, 0));

    elements.push({
      id: `section-bg-${section.id}`,
      type: 'rectangle',
      x,
      y,
      width,
      height,
      strokeColor: options.stroke || '#94a3b8',
      backgroundColor: options.fill || '#f8fafc',
      roundness: 18,
      opacity: 60,
    });
    elements.push({
      id: `section-title-${section.id}`,
      type: 'text',
      x: x + 18,
      y: y + 16,
      text: section.title,
      fontSize: 18,
      strokeColor: options.titleColor || '#334155',
    });

    let cursorY = y + 60;
    nodes.forEach((node) => {
      const measured = measuredNodes.get(node.id);
      nodePositions.set(node.id, {
        x: x + Math.round((width - (measured?.width || 220)) / 2),
        y: cursorY,
      });
      cursorY += (measured?.height || 80) + 20;
    });
  });

  const renderedNodes = plan.nodes.map((node) => {
    const position = nodePositions.get(node.id) || { x: 160, y: 140 };
    return createRenderedNode(node, position.x, position.y, plan.diagramType, measuredNodes.get(node.id));
  });
  const anchors = renderedNodes.map((entry) => entry.anchor);

  return [...elements, ...renderedNodes.flatMap((entry) => entry.elements), ...buildEdgeElements(plan, anchors)];
}

function pushDiagramTitle(elements, title) {
  if (!title) return;
  elements.push({
    id: 'diagram-title',
    type: 'text',
    x: 100,
    y: 20,
    text: title,
    fontSize: 28,
    strokeColor: '#173038',
    groupIds: ['meta-title'],
  });
}

function createInitialNodePositions(plan) {
  const positions = new Map();
  const nodes = plan.nodes;
  const edges = plan.edges;

  if (plan.sections.length > 0) {
    const sectionNodes = new Map(plan.sections.map((section) => [section.id, []]));
    nodes.forEach((node) => {
      if (node.sectionId && sectionNodes.has(node.sectionId)) {
        sectionNodes.get(node.sectionId).push(node);
      }
    });

    plan.sections.forEach((section, sectionIndex) => {
      const groupedNodes = sectionNodes.get(section.id) || [];
      const originX = 120 + (sectionIndex % 3) * 420;
      const originY = 120 + Math.floor(sectionIndex / 3) * 320;
      groupedNodes.forEach((node, index) => {
        const row = Math.floor(index / 2);
        const col = index % 2;
        positions.set(node.id, {
          x: originX + col * 230,
          y: originY + row * 150,
        });
      });
    });
  }

  const unpositioned = nodes.filter((node) => !positions.has(node.id));
  if (edges.length > 0 && unpositioned.length > 0) {
    const layers = assignLayers(nodes, edges);
    const grouped = new Map();
    nodes.forEach((node) => {
      const layer = layers.get(node.id) || 0;
      if (!grouped.has(layer)) grouped.set(layer, []);
      grouped.get(layer).push(node);
    });

    [...grouped.entries()].forEach(([layer, layerNodes]) => {
      layerNodes.forEach((node, index) => {
        if (positions.has(node.id)) return;
        positions.set(node.id, {
          x: 120 + index * 260,
          y: 140 + layer * 170,
        });
      });
    });
  }

  nodes.forEach((node, index) => {
    if (positions.has(node.id)) return;
    const row = Math.floor(index / 3);
    const col = index % 3;
    positions.set(node.id, {
      x: 120 + col * 260,
      y: 140 + row * 170,
    });
  });

  return positions;
}

function assignLayers(nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    outgoing.get(edge.from).push(edge.to);
  });

  const queue = nodes.filter((node) => (indegree.get(node.id) || 0) === 0).map((node) => node.id);
  const layers = new Map();

  queue.forEach((nodeId) => layers.set(nodeId, 0));

  while (queue.length > 0) {
    const current = queue.shift();
    const nextLayer = (layers.get(current) || 0) + 1;
    (outgoing.get(current) || []).forEach((childId) => {
      indegree.set(childId, (indegree.get(childId) || 0) - 1);
      layers.set(childId, Math.max(layers.get(childId) || 0, nextLayer));
      if ((indegree.get(childId) || 0) <= 0) {
        queue.push(childId);
      }
    });
  }

  nodes.forEach((node) => {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0);
    }
  });

  return layers;
}

function buildLayerPositions(nodes, edges, measuredNodes, options = {}) {
  const {
    orientation = 'TB',
    startX = 120,
    startY = 120,
    layerGap = orientation === 'TB' ? 180 : 260,
    nodeGap = 80,
  } = options;
  const layers = assignLayers(nodes, edges);
  const grouped = new Map();
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const positions = new Map();

  nodes.forEach((node) => {
    const layer = layers.get(node.id) || 0;
    if (!grouped.has(layer)) grouped.set(layer, []);
    grouped.get(layer).push(node);
  });

  [...grouped.keys()].sort((a, b) => a - b).forEach((layer) => {
    const layerNodes = grouped.get(layer).sort((a, b) => (nodeOrder.get(a.id) || 0) - (nodeOrder.get(b.id) || 0));
    if (orientation === 'TB') {
      const totalWidth = layerNodes.reduce((sum, node) => sum + (measuredNodes.get(node.id)?.width || 220), 0)
        + Math.max(0, layerNodes.length - 1) * nodeGap;
      let cursorX = startX + Math.max(0, 620 - totalWidth / 2);
      const y = startY + layer * layerGap;
      layerNodes.forEach((node) => {
        const measured = measuredNodes.get(node.id);
        positions.set(node.id, { x: Math.round(cursorX), y });
        cursorX += (measured?.width || 220) + nodeGap;
      });
      return;
    }

    const totalHeight = layerNodes.reduce((sum, node) => sum + (measuredNodes.get(node.id)?.height || 80), 0)
      + Math.max(0, layerNodes.length - 1) * nodeGap;
    let cursorY = startY + Math.max(0, 260 - totalHeight / 2);
    const x = startX + layer * layerGap;
    layerNodes.forEach((node) => {
      const measured = measuredNodes.get(node.id);
      positions.set(node.id, { x, y: Math.round(cursorY) });
      cursorY += (measured?.height || 80) + nodeGap;
    });
  });

  return positions;
}

function chooseHubNode(nodes, edges) {
  if (nodes.length === 0) return null;

  const scores = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    if (scores.has(edge.from)) scores.set(edge.from, (scores.get(edge.from) || 0) + 1);
    if (scores.has(edge.to)) scores.set(edge.to, (scores.get(edge.to) || 0) + 1);
  });

  return [...nodes].sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0))[0];
}

function buildRadialPositions(nodes, edges, measuredNodes, rootId, options = {}) {
  const {
    centerX = 760,
    centerY = 420,
    outerRadiusX = 380,
    outerRadiusY = 250,
    childRadius = 160,
  } = options;
  const positions = new Map();
  if (nodes.length === 0) return positions;

  const root = nodes.find((node) => node.id === rootId) || chooseHubNode(nodes, edges) || nodes[0];
  const rootMeasured = measuredNodes.get(root.id);
  positions.set(root.id, {
    x: Math.round(centerX - (rootMeasured?.width || 220) / 2),
    y: Math.round(centerY - (rootMeasured?.height || 90) / 2),
  });

  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    if (adjacency.has(edge.from)) adjacency.get(edge.from).push(edge.to);
  });

  const firstRing = nodes.filter((node) => node.id !== root.id);
  const firstRingCount = Math.max(firstRing.length, 1);

  firstRing.forEach((node, index) => {
    const angle = (index / firstRingCount) * Math.PI * 2 - Math.PI / 2;
    const measured = measuredNodes.get(node.id);
    const ringCenterX = centerX + Math.cos(angle) * outerRadiusX;
    const ringCenterY = centerY + Math.sin(angle) * outerRadiusY;
    positions.set(node.id, {
      x: Math.round(ringCenterX - (measured?.width || 220) / 2),
      y: Math.round(ringCenterY - (measured?.height || 90) / 2),
    });

    const children = (adjacency.get(node.id) || [])
      .map((childId) => nodes.find((candidate) => candidate.id === childId))
      .filter(Boolean)
      .filter((child) => child.id !== root.id);

    children.forEach((child, childIndex) => {
      const childMeasured = measuredNodes.get(child.id);
      const childAngle = angle + ((childIndex - (children.length - 1) / 2) * 0.45);
      const childCenterX = ringCenterX + Math.cos(childAngle) * childRadius;
      const childCenterY = ringCenterY + Math.sin(childAngle) * childRadius;
      positions.set(child.id, {
        x: Math.round(childCenterX - (childMeasured?.width || 220) / 2),
        y: Math.round(childCenterY - (childMeasured?.height || 90) / 2),
      });
    });
  });

  return positions;
}

function measureClassNode(node) {
  const lines = (node.details || []).length;
  const allLines = [node.label, ...(node.details || [])];
  const longest = allLines.reduce((max, line) => Math.max(max, cleanLabel(line).length), 0);
  const width = Math.max(240, Math.min(380, 140 + longest * 8));
  const headerHeight = 48;
  const bodyHeight = Math.max(54, lines * 22 + 24);

  return {
    width,
    height: headerHeight + bodyHeight,
    headerHeight,
    bodyHeight,
  };
}

function createRenderedClassNode(node, x, y, measured) {
  const anchor = {
    id: node.id,
    type: 'rectangle',
    x,
    y,
    width: measured.width,
    height: measured.height,
    strokeColor: '#334155',
    backgroundColor: '#ffffff',
  };

  const elements = [
    anchor,
    {
      id: `class-header-${node.id}`,
      type: 'rectangle',
      x,
      y,
      width: measured.width,
      height: measured.headerHeight,
      strokeColor: '#1d4ed8',
      backgroundColor: '#dbeafe',
      label: { text: node.label, fontSize: 18 },
    },
    {
      id: `class-divider-${node.id}`,
      type: 'line',
      x,
      y: y + measured.headerHeight,
      width: measured.width,
      height: 0,
      strokeColor: '#94a3b8',
    },
    {
      id: `class-body-${node.id}`,
      type: 'text',
      x: x + 18,
      y: y + measured.headerHeight + 14,
      text: (node.details || []).join('\n') || 'No members',
      fontSize: 15,
      strokeColor: '#334155',
    },
  ];

  return { anchor, elements };
}

function resolveAttributeHost(node, plan) {
  if (node.parentId) {
    return plan.nodes.find((candidate) => candidate.id === node.parentId);
  }

  const connectedEdge = plan.edges.find((edge) => edge.from === node.id || edge.to === node.id);
  if (!connectedEdge) return null;

  const otherId = connectedEdge.from === node.id ? connectedEdge.to : connectedEdge.from;
  return plan.nodes.find((candidate) => candidate.id === otherId) || null;
}

function getShapeDiagramItems(plan) {
  if (plan.nodes.length > 0) {
    return plan.nodes.slice(0, 6).map((node) => ({
      id: node.id,
      label: node.label,
      details: node.details || [],
    }));
  }

  if (plan.sections.length > 0) {
    return plan.sections.map((section) => ({ id: section.id, label: section.title, details: [] }));
  }

  return [];
}

function deriveSequenceParticipants(plan) {
  const participantKinds = new Set(['participant', 'actor', 'service']);
  const participants = plan.nodes
    .filter((node) => participantKinds.has(node.kind))
    .map((node) => ({ id: node.id, label: node.label }));

  if (participants.length > 0) {
    return participants;
  }

  const participantsFromSections = plan.sections.length > 0
    ? plan.sections.map((section) => ({ id: section.id, label: section.title }))
    : [];

  if (participantsFromSections.length > 0) {
    return participantsFromSections;
  }

  return plan.nodes.slice(0, Math.max(2, Math.min(6, plan.nodes.length))).map((node) => ({
    id: node.id,
    label: node.label,
  }));
}

function ensureSequenceParticipants(nodesResult, sections) {
  const participantKinds = new Set(['participant', 'actor', 'service']);
  const hasParticipants = nodesResult.nodes.some((node) => participantKinds.has(node.kind));
  if (hasParticipants || sections.length === 0) {
    return;
  }

  const usedIds = new Set(nodesResult.nodes.map((node) => node.id));
  sections.forEach((section) => {
    const participantId = uniqueId(`${section.id}-participant`, usedIds);
    nodesResult.nodes.push({
      id: participantId,
      label: section.title,
      kind: 'participant',
      sectionId: undefined,
      details: [],
      parentId: undefined,
    });
    nodesResult.aliases.set(section.id, participantId);
    nodesResult.aliases.set(section.title.toLowerCase(), participantId);
  });
}

function buildQuadrants(plan) {
  const defaultTitles = plan.diagramType === 'swot'
    ? ['Strengths', 'Weaknesses', 'Opportunities', 'Threats']
    : ['Quadrant 1', 'Quadrant 2', 'Quadrant 3', 'Quadrant 4'];
  const palette = [
    { backgroundColor: '#ecfeff', strokeColor: '#0891b2' },
    { backgroundColor: '#fef3c7', strokeColor: '#d97706' },
    { backgroundColor: '#ecfccb', strokeColor: '#65a30d' },
    { backgroundColor: '#fee2e2', strokeColor: '#dc2626' },
  ];

  const sections = plan.sections.length >= 4
    ? plan.sections.slice(0, 4)
    : defaultTitles.map((title, index) => ({
        id: slugify(title) || `quadrant-${index + 1}`,
        title,
        kind: 'quadrant',
        items: plan.nodes
          .filter((node) => node.sectionId === plan.sections[index]?.id)
          .map((node) => node.id),
      }));

  return sections.map((section, index) => {
    const items = plan.nodes.filter((node) => node.sectionId === section.id).slice(0, 4);
    return {
      id: section.id,
      title: section.title || defaultTitles[index],
      items,
      backgroundColor: palette[index % palette.length].backgroundColor,
      strokeColor: palette[index % palette.length].strokeColor,
    };
  });
}

function buildSectionLayouts(plan, measuredNodes) {
  const sectionNodes = new Map(plan.sections.map((section) => [section.id, []]));
  plan.nodes.forEach((node) => {
    if (node.sectionId && sectionNodes.has(node.sectionId)) {
      sectionNodes.get(node.sectionId).push(node);
    }
  });

  const layers = assignSectionLayers(plan.sections, plan.edges, plan.nodes);
  const grouped = new Map();

  plan.sections.forEach((section, index) => {
    const nodes = sectionNodes.get(section.id) || [];
    if (nodes.length === 0) return;

    const layout = buildSingleSectionLayout(section, nodes, measuredNodes);
    layout.index = index;
    layout.layer = layers.get(section.id) || 0;
    if (!grouped.has(layout.layer)) grouped.set(layout.layer, []);
    grouped.get(layout.layer).push(layout);
  });

  const ordered = [];
  let currentX = 80;

  [...grouped.keys()].sort((a, b) => a - b).forEach((layer) => {
    const layerLayouts = grouped.get(layer).sort((a, b) => a.index - b.index);
    let currentY = 120;
    let layerWidth = 0;

    layerLayouts.forEach((layout) => {
      layout.x = currentX;
      layout.y = currentY;
      layout.items = positionNodesInsideSection(layout, measuredNodes);
      currentY += layout.height + 48;
      layerWidth = Math.max(layerWidth, layout.width);
      ordered.push(layout);
    });

    currentX += layerWidth + 120;
  });

  return {
    ordered,
    byId: new Map(ordered.map((layout) => [layout.section.id, layout])),
  };
}

function buildNetworkSectionLayouts(plan, measuredNodes) {
  const sectionNodes = new Map(plan.sections.map((section) => [section.id, []]));
  plan.nodes.forEach((node) => {
    if (node.sectionId && sectionNodes.has(node.sectionId)) {
      sectionNodes.get(node.sectionId).push(node);
    }
  });

  const ordered = plan.sections
    .map((section, index) => {
      const nodes = sectionNodes.get(section.id) || [];
      if (nodes.length === 0) return null;
      const layout = buildSingleSectionLayout(section, nodes, measuredNodes);
      layout.index = index;
      layout.items = [];
      return layout;
    })
    .filter(Boolean);

  if (ordered.length === 0) {
    return { ordered: [], byId: new Map() };
  }

  const sectionGraph = buildSectionGraph(plan.sections, plan.edges, plan.nodes);
  const hubId = chooseNetworkHubSection(ordered, sectionGraph);

  if (!hubId || ordered.length <= 2) {
    let currentX = 100;
    let currentY = 120;
    let rowHeight = 0;
    const maxRowWidth = 1400;

    ordered.forEach((layout) => {
      if (currentX > 100 && currentX + layout.width > maxRowWidth) {
        currentX = 100;
        currentY += rowHeight + 90;
        rowHeight = 0;
      }

      layout.x = currentX;
      layout.y = currentY;
      layout.items = positionNodesInsideNetworkSection(layout, measuredNodes);
      currentX += layout.width + 80;
      rowHeight = Math.max(rowHeight, layout.height);
    });

    return {
      ordered,
      byId: new Map(ordered.map((layout) => [layout.section.id, layout])),
    };
  }

  const hubLayout = ordered.find((layout) => layout.section.id === hubId);
  const satelliteLayouts = ordered.filter((layout) => layout.section.id !== hubId);
  const centerX = 760;
  const centerY = 560;

  hubLayout.x = Math.round(centerX - hubLayout.width / 2);
  hubLayout.y = Math.round(centerY - hubLayout.height / 2);
  hubLayout.items = positionNodesInsideNetworkSection(hubLayout, measuredNodes);

  const startAngle = -160;
  const endAngle = -20;
  const angleStep = satelliteLayouts.length === 1 ? 0 : (endAngle - startAngle) / (satelliteLayouts.length - 1);
  const radiusX = 470;
  const radiusY = 300;

  satelliteLayouts
    .sort((a, b) => {
      const degreeA = sectionGraph.get(a.section.id)?.size || 0;
      const degreeB = sectionGraph.get(b.section.id)?.size || 0;
      return degreeB - degreeA || a.index - b.index;
    })
    .forEach((layout, index) => {
      const angle = (startAngle + angleStep * index) * (Math.PI / 180);
      const sectionCenterX = centerX + Math.cos(angle) * radiusX;
      const sectionCenterY = centerY + Math.sin(angle) * radiusY;
      layout.x = Math.round(sectionCenterX - layout.width / 2);
      layout.y = Math.round(sectionCenterY - layout.height / 2);
      layout.items = positionNodesInsideNetworkSection(layout, measuredNodes);
    });

  return {
    ordered,
    byId: new Map(ordered.map((layout) => [layout.section.id, layout])),
  };
}

function buildSingleSectionLayout(section, nodes, measuredNodes) {
  const columnCount = nodes.length >= 4 ? 2 : 1;
  const rowCount = Math.ceil(nodes.length / columnCount);
  const maxItemWidth = Math.max(...nodes.map((node) => measuredNodes.get(node.id)?.width || 220), 220);
  const maxItemHeight = Math.max(...nodes.map((node) => measuredNodes.get(node.id)?.height || 90), 90);
  const paddingX = 34;
  const paddingTop = 54;
  const paddingBottom = 28;
  const innerGapX = 42;
  const innerGapY = 34;

  return {
    section,
    nodes,
    width: Math.max(320, paddingX * 2 + columnCount * maxItemWidth + (columnCount - 1) * innerGapX),
    height: Math.max(150, paddingTop + paddingBottom + rowCount * maxItemHeight + Math.max(0, rowCount - 1) * innerGapY),
    maxItemWidth,
    maxItemHeight,
    paddingX,
    paddingTop,
    innerGapX,
    innerGapY,
    columnCount,
  };
}

function positionNodesInsideSection(layout, measuredNodes) {
  const items = [];
  const totalItemsWidth = layout.columnCount * layout.maxItemWidth + (layout.columnCount - 1) * layout.innerGapX;
  const startX = layout.x + Math.max(layout.paddingX, Math.round((layout.width - totalItemsWidth) / 2));

  layout.nodes.forEach((node, index) => {
    const measured = measuredNodes.get(node.id);
    const col = layout.columnCount === 1 ? 0 : index % layout.columnCount;
    const row = Math.floor(index / layout.columnCount);
    const slotX = startX + col * (layout.maxItemWidth + layout.innerGapX);
    const slotY = layout.y + layout.paddingTop + row * (layout.maxItemHeight + layout.innerGapY);

    items.push({
      node,
      x: slotX + Math.round((layout.maxItemWidth - (measured?.width || layout.maxItemWidth)) / 2),
      y: slotY + Math.round((layout.maxItemHeight - (measured?.height || layout.maxItemHeight)) / 2),
    });
  });

  return items;
}

function positionNodesInsideNetworkSection(layout, measuredNodes) {
  const serviceNodes = [];
  const networkNodes = [];
  const otherNodes = [];

  layout.nodes.forEach((node) => {
    if (isNetworkLabelNode(node)) {
      networkNodes.push(node);
      return;
    }
    if (node.kind === 'service' || node.kind === 'actor') {
      serviceNodes.push(node);
      return;
    }
    otherNodes.push(node);
  });

  const items = [];
  const topBandY = layout.y + 54;
  const centerX = layout.x + layout.width / 2;
  const middleY = layout.y + layout.height / 2;

  const placeNodeCentered = (node, centerNodeX, nodeY) => {
    const measured = measuredNodes.get(node.id);
    const width = measured?.width || layout.maxItemWidth;
    const height = measured?.height || layout.maxItemHeight;
    items.push({
      node,
      x: Math.round(centerNodeX - width / 2),
      y: Math.round(nodeY - height / 2),
    });
  };

  const primaryNode = serviceNodes[0] || otherNodes[0] || networkNodes[0];
  const upperNodes = networkNodes.filter((node) => node.id !== primaryNode?.id);
  if (primaryNode && isNetworkLabelNode(primaryNode)) {
    upperNodes.unshift(primaryNode);
  }

  const remainingNodes = [...serviceNodes.slice(primaryNode?.id === serviceNodes[0]?.id ? 1 : 0), ...otherNodes.slice(primaryNode?.id === otherNodes[0]?.id ? 1 : 0), ...networkNodes.slice(upperNodes.length)];
  const primaryCenterY = remainingNodes.length > 0 ? layout.y + Math.round(layout.height * 0.44) : middleY + 8;
  const bottomRowCenterY = layout.y + Math.round(layout.height * 0.76);

  if (primaryNode) {
    placeNodeCentered(primaryNode, centerX, primaryCenterY);
  }

  upperNodes.slice(0, 2).forEach((node, index) => {
    const offset = upperNodes.length > 1 ? (index === 0 ? -110 : 110) : 0;
    placeNodeCentered(node, centerX + offset, topBandY + 34);
  });

  remainingNodes.slice(0, 3).forEach((node, index) => {
    const offset = remainingNodes.length === 1 ? 0 : index === 0 ? -130 : index === 1 ? 130 : 0;
    const y = remainingNodes.length >= 3 && index === 2 ? topBandY + 42 : bottomRowCenterY;
    placeNodeCentered(node, centerX + offset, y);
  });

  return items;
}

function positionOrphanNodes(nodes, plan, measuredNodes, nodePositions, sectionLayouts) {
  let freeX = 120;

  nodes.forEach((node, index) => {
    const relatedSectionIds = getRelatedSectionIds(node, plan);
    const anchorLayout = relatedSectionIds.map((sectionId) => sectionLayouts.byId.get(sectionId)).find(Boolean);
    const measured = measuredNodes.get(node.id);

    if (anchorLayout) {
      const anchorCenterX = anchorLayout.x + Math.round(anchorLayout.width / 2);
      nodePositions.set(node.id, {
        x: anchorCenterX - Math.round((measured?.width || 220) / 2),
        y: 50 + (index % 2) * 26,
      });
      return;
    }

    nodePositions.set(node.id, {
      x: freeX,
      y: 70 + (index % 2) * 30,
    });
    freeX += (measured?.width || 220) + 40;
  });
}

function getRelatedSectionIds(node, plan) {
  const related = [];
  plan.edges.forEach((edge) => {
    if (edge.from !== node.id && edge.to !== node.id) return;
    const otherId = edge.from === node.id ? edge.to : edge.from;
    const otherNode = plan.nodes.find((candidate) => candidate.id === otherId);
    if (otherNode?.sectionId) {
      related.push(otherNode.sectionId);
    }
  });
  return [...new Set(related)];
}

function assignSectionLayers(sections, edges, nodes) {
  const sectionIds = new Set(sections.map((section) => section.id));
  const nodeSectionMap = new Map(nodes.map((node) => [node.id, node.sectionId]));
  const sectionEdges = [];
  const seen = new Set();

  edges.forEach((edge) => {
    const fromSection = nodeSectionMap.get(edge.from);
    const toSection = nodeSectionMap.get(edge.to);
    if (!fromSection || !toSection || fromSection === toSection) return;
    if (!sectionIds.has(fromSection) || !sectionIds.has(toSection)) return;

    const key = `${fromSection}->${toSection}`;
    if (seen.has(key)) return;
    seen.add(key);
    sectionEdges.push({ from: fromSection, to: toSection });
  });

  return assignLayers(
    sections.map((section) => ({ id: section.id })),
    sectionEdges
  );
}

function buildEdgeElements(plan, nodeElements) {
  const nodeSet = new Set(nodeElements.map((element) => element.id));
  const nodeMap = new Map(nodeElements.map((element) => [element.id, element]));

  return plan.edges
    .filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to))
    .map((edge, index) => {
      const start = nodeMap.get(edge.from);
      return {
        id: `edge-${index + 1}-${edge.from}-${edge.to}`,
        type: 'arrow',
        x: start ? start.x + Math.round((start.width || 200) / 2) : 100,
        y: start ? start.y + Math.round((start.height || 80) / 2) : 100,
        width: 180,
        height: 0,
        strokeColor: edge.style === 'dashed' ? '#64748b' : '#355070',
        strokeStyle: edge.style === 'dashed' ? 'dashed' : 'solid',
        start: { id: edge.from },
        end: { id: edge.to },
        label: edge.label ? { text: edge.label, fontSize: 12 } : undefined,
      };
    });
}

function buildSectionGraph(sections, edges, nodes) {
  const sectionIds = new Set(sections.map((section) => section.id));
  const nodeSectionMap = new Map(nodes.map((node) => [node.id, node.sectionId]));
  const graph = new Map(sections.map((section) => [section.id, new Set()]));

  edges.forEach((edge) => {
    const fromSection = nodeSectionMap.get(edge.from);
    const toSection = nodeSectionMap.get(edge.to);
    if (!fromSection || !toSection || fromSection === toSection) return;
    if (!sectionIds.has(fromSection) || !sectionIds.has(toSection)) return;
    graph.get(fromSection).add(toSection);
    graph.get(toSection).add(fromSection);
  });

  return graph;
}

function chooseNetworkHubSection(layouts, sectionGraph) {
  const ranked = layouts
    .map((layout) => ({
      id: layout.section.id,
      degree: sectionGraph.get(layout.section.id)?.size || 0,
      nodes: layout.nodes.length,
      score: (sectionGraph.get(layout.section.id)?.size || 0) * 10 + layout.nodes.length,
    }))
    .sort((a, b) => b.score - a.score || b.degree - a.degree || b.nodes - a.nodes);

  return ranked[0]?.degree >= 2 ? ranked[0].id : null;
}

function createRenderedNode(node, x, y, diagramType, measured = null) {
  const anchor = createNodeElement(node, x, y, diagramType, measured);
  return { anchor, elements: [anchor] };
}

function createNodeElement(node, x, y, diagramType, measured = null) {
  const shape = determineShape(node, diagramType);
  const labelText = measured?.labelText || buildNodeLabel(node);
  const { width, height, fontSize } = measured || measureNode(node, labelText, shape);
  const palette = diagramType === 'network' && isNetworkMetadataNode(node)
    ? colorPaletteForNode('note')
    : colorPaletteForNode(node.kind);

  const element = {
    id: node.id,
    type: shape,
    x,
    y,
    width,
    height,
    strokeColor: palette.strokeColor,
    backgroundColor: palette.backgroundColor,
    label: {
      text: labelText,
      fontSize,
      textAlign: 'center',
      verticalAlign: 'middle',
    },
  };

  if (diagramType === 'state' && shape === 'rectangle') {
    element.roundness = 18;
  }

  return element;
}

function determineShape(node, diagramType) {
  if (diagramType === 'orgchart') {
    return 'rectangle';
  }
  if (node.kind === 'decision') return 'diamond';
  if (node.kind === 'start' || node.kind === 'end' || node.kind === 'event' || node.kind === 'actor' || node.kind === 'participant') {
    return 'ellipse';
  }
  if (node.kind === 'attribute' && diagramType === 'er') {
    return 'ellipse';
  }
  if (diagramType === 'network') {
    if (isNetworkMetadataNode(node)) {
      return 'rectangle';
    }
    return inferNetworkShapeFromLabel(node.label);
  }
  return 'rectangle';
}

function inferNetworkShapeFromLabel(label) {
  const normalized = cleanLabel(label).toLowerCase();

  if (/^(rt|rtr|sw|fw|gw)[a-z0-9-]*\b/.test(normalized)) {
    return 'ellipse';
  }

  if (/router|gateway|firewall|vpn/.test(normalized)) {
    return 'ellipse';
  }

  if (/cloud|internet|wan|workstation|laptop|desktop|client|phone|user|pc/.test(normalized)) {
    return 'ellipse';
  }

  return 'rectangle';
}

function buildNodeLabel(node) {
  const detailLines = node.details.slice(0, 5).map((detail) => `• ${detail}`);
  return [node.label, ...detailLines].filter(Boolean).join('\n');
}

function buildShapeItemLabel(item, maxDetails = 2) {
  const details = Array.isArray(item.details) ? item.details.slice(0, maxDetails) : [];
  const detailLines = details.map((detail) => `• ${detail}`);
  return [item.label, ...detailLines].filter(Boolean).join('\n');
}

function measureNodes(nodes, diagramType) {
  return new Map(
    nodes.map((node) => {
      const shape = determineShape(node, diagramType);
      const labelText = buildNodeLabel(node);
      return [node.id, measureNode(node, labelText, shape)];
    })
  );
}

function measureNode(node, labelText, shape) {
  if (isNetworkMetadataNode(node)) {
    const lines = labelText.split('\n');
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
    return {
      width: Math.max(220, Math.min(320, 120 + longest * 7)),
      height: Math.max(84, 34 + lines.length * 22),
      fontSize: 16,
      labelText,
    };
  }

  const lines = labelText.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const fontSize = lines.length > 3 ? 16 : 18;
  let width = Math.max(200, Math.min(360, 120 + longest * 7));
  let height = Math.max(shape === 'diamond' ? 84 : 72, 36 + lines.length * 24);

  if (shape === 'diamond') {
    width = Math.max(220, width);
    height = Math.min(120, Math.max(84, height));
  }

  return {
    width,
    height,
    fontSize,
    labelText,
  };
}

function colorPaletteForNode(kind) {
  switch (kind) {
    case 'start':
      return { strokeColor: '#d97706', backgroundColor: '#fef3c7' };
    case 'end':
      return { strokeColor: '#15803d', backgroundColor: '#dcfce7' };
    case 'decision':
      return { strokeColor: '#ea580c', backgroundColor: '#ffedd5' };
    case 'database':
      return { strokeColor: '#1d4ed8', backgroundColor: '#dbeafe' };
    case 'actor':
    case 'participant':
      return { strokeColor: '#5b21b6', backgroundColor: '#ede9fe' };
    case 'note':
      return { strokeColor: '#64748b', backgroundColor: '#f8fafc' };
    case 'state':
      return { strokeColor: '#0f766e', backgroundColor: '#ccfbf1' };
    default:
      return { strokeColor: '#2563eb', backgroundColor: '#e0f2fe' };
  }
}

function isNetworkMetadataNode(node) {
  const normalized = cleanLabel(`${node.label} ${(node.details || []).join(' ')}`).toLowerCase();
  return /subinterface|vlan\b|subnet|gateway|trunk|802\.1q|forwarding|tagging|routing support|access port|port membership/.test(normalized);
}

function applyChartTypeNodeSemantics(nodes, diagramType) {
  return nodes.map((node) => {
    switch (diagramType) {
      case 'flowchart':
        return {
          ...node,
          kind: node.kind === 'note' ? 'note' : inferKindFromLabel(node.label),
        };
      case 'orgchart':
        return {
          ...node,
          kind: node.kind === 'note' ? 'note' : 'actor',
        };
      case 'network':
        return {
          ...node,
          kind: classifyNetworkNodeKind(node),
        };
      case 'architecture':
        return {
          ...node,
          kind: classifyArchitectureNodeKind(node),
        };
      case 'dataflow':
        return {
          ...node,
          kind: classifyDataflowNodeKind(node),
        };
      case 'state':
        return {
          ...node,
          kind: node.kind === 'start' || node.kind === 'end' ? node.kind : 'state',
        };
      default:
        return node;
    }
  });
}

function applyChartTypeSectionSemantics(sections, diagramType) {
  if (diagramType === 'swimlane') {
    return sections.map((section) => ({ ...section, kind: 'lane' }));
  }

  if (diagramType === 'matrix' || diagramType === 'swot') {
    return sections.map((section) => ({ ...section, kind: 'quadrant' }));
  }

  return sections;
}

function classifyNetworkNodeKind(node) {
  const normalized = cleanLabel(`${node.label} ${(node.details || []).join(' ')}`).toLowerCase();

  if (isNetworkMetadataNode(node)) return 'note';
  if (isNetworkLabelNode(node)) return 'data';
  if (/database|storage|nas|san|db/.test(normalized)) return 'database';
  if (/host|client|user|pc|desktop|laptop|printer|phone|tablet|workstation/.test(normalized)) return 'actor';
  if (/^(rt|rtr|sw|fw|gw)[a-z0-9-]*\b/.test(normalized)) return 'service';
  if (/router|switch|firewall|gateway|access point|wifi|wireless|vpn|load balancer|server|cloud|internet|wan|edge/.test(normalized)) {
    return 'service';
  }

  return node.kind === 'note' ? 'note' : 'process';
}

function isNetworkLabelNode(node) {
  const normalized = cleanLabel(`${node.label} ${(node.details || []).join(' ')}`).toLowerCase();
  return /^(network|subnet|vlan|lan|segment)/.test(normalized);
}

function classifyArchitectureNodeKind(node) {
  const normalized = cleanLabel(`${node.label} ${(node.details || []).join(' ')}`).toLowerCase();

  if (/database|storage|cache|queue|warehouse|blob|bucket|db/.test(normalized)) return 'database';
  if (/user|client|browser|mobile|partner|external/.test(normalized)) return 'actor';
  if (/service|api|worker|gateway|frontend|backend|app|server|auth/.test(normalized)) return 'service';

  return node.kind === 'note' ? 'note' : 'process';
}

function classifyDataflowNodeKind(node) {
  const normalized = cleanLabel(`${node.label} ${(node.details || []).join(' ')}`).toLowerCase();

  if (/database|storage|queue|topic|bucket|warehouse|db/.test(normalized)) return 'database';
  if (/user|client|partner|external|source|sink/.test(normalized)) return 'actor';
  if (/process|transform|job|pipeline|service|handler|worker/.test(normalized)) return 'process';

  return node.kind === 'note' ? 'note' : 'process';
}

export function finalizeElementArray(elements, diagramType, options = {}) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return [];
  }

  const styledElements = applyDefaultStrokeWidths(elements, diagramType);

  if (diagramType === 'sequence' || diagramType === 'timeline' || diagramType === 'matrix' || diagramType === 'swot') {
    return styledElements;
  }

  const optimized = optimizeExcalidrawCode(JSON.stringify(styledElements), {
    chartType: diagramType,
    skipLayout: Boolean(options.preserveLayout),
  });
  const parsed = safeParseJsonWithRepair(optimized);
  return parsed.ok && Array.isArray(parsed.value) ? parsed.value : styledElements;
}

function sanitizeDiagramType(value, fallback) {
  const normalized = asCleanString(value)?.toLowerCase();
  return normalized && DIAGRAM_TYPES.has(normalized) ? normalized : fallback;
}

function normalizeKind(value) {
  const normalized = asCleanString(value)?.toLowerCase();
  if (!normalized) return 'process';
  return KIND_ALIASES.get(normalized) || 'process';
}

function normalizeSectionKind(value) {
  const normalized = asCleanString(value)?.toLowerCase();
  if (normalized === 'lane' || normalized === 'quadrant' || normalized === 'cluster') {
    return normalized;
  }
  return 'frame';
}

function normalizeDetails(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanLabel(item)).filter(Boolean).slice(0, 6);
  }

  const single = cleanLabel(value);
  if (!single) return [];

  return single
    .split(/\r?\n|;+/)
    .map((item) => cleanLabel(item))
    .filter(Boolean)
    .slice(0, 6);
}

function resolveSectionId(token, sections, sectionIds) {
  const normalizedToken = token.toLowerCase();
  const direct = sections.find((section) => section.id === normalizedToken || section.title.toLowerCase() === normalizedToken);
  if (direct) return direct.id;

  const slug = slugify(token);
  return sectionIds.has(slug) ? slug : slug || undefined;
}

function inferKindFromLabel(label) {
  const normalized = label.toLowerCase();
  if (/start|begin|trigger/.test(normalized)) return 'start';
  if (/end|done|finish|complete|success/.test(normalized)) return 'end';
  if (/decision|if |yes\/no|approve|valid/.test(normalized)) return 'decision';
  if (/database|db|storage|table/.test(normalized)) return 'database';
  if (/user|client|actor|customer/.test(normalized)) return 'actor';
  if (/state/.test(normalized)) return 'state';
  if (/note|legend/.test(normalized)) return 'note';
  return 'process';
}

function defaultTitleForType(type) {
  return titleCase(type.replace(/[-_]+/g, ' '));
}

function cleanLabel(value) {
  const normalized = asCleanString(value);
  if (!normalized) return '';
  return normalized.replace(/\s+/g, ' ').trim();
}

function asCleanString(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function slugify(value) {
  const source = asCleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return source || '';
}

function uniqueId(base, usedIds) {
  let next = base || 'item';
  let counter = 2;
  while (usedIds.has(next)) {
    next = `${base}-${counter++}`;
  }
  usedIds.add(next);
  return next;
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function applyDefaultStrokeWidths(elements, diagramType) {
  const baseWidth = diagramType === 'network' || diagramType === 'architecture' || diagramType === 'dataflow' ? 3 : 2;

  return elements.map((element) => {
    if (!element || !['rectangle', 'ellipse', 'diamond', 'line', 'arrow'].includes(element.type)) {
      return element;
    }

    if (Number.isFinite(element.strokeWidth)) {
      return element;
    }

    return {
      ...element,
      strokeWidth: baseWidth,
    };
  });
}
