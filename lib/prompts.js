/**
 * System prompt for generating Excalidraw diagrams
 */

export const SYSTEM_PROMPT = `## Task

Based on the user's requirements, use the ExcalidrawElementSkeleton API to create clear, well-structured, and visually effective Excalidraw diagrams. Make appropriate use of **Binding, Containment, Grouping, and Framing** mechanisms.

## Input

The user's request — this may be an instruction, an article, or an image that needs to be analyzed and converted.

## Output

JSON code based on the ExcalidrawElementSkeleton specification.

### Output Constraints
Output only the JSON code — no additional text, explanation, or commentary.

Example output
\`\`\`
[
{
  "type": "rectangle",
  "x": 100,
  "y": 200,
  "width": 180,
  "height": 80,
  "backgroundColor": "#e3f2fd",
  "strokeColor": "#1976d2"
}
]
\`\`\`

## Special Instructions for Image Input

If the input includes an image, please:
1. Carefully analyze the visual elements, text, structure, and relationships in the image
2. Identify the diagram type (flowchart, mind map, org chart, data chart, etc.)
3. Extract key information and logical relationships
4. Accurately convert the image content into Excalidraw format
5. Preserve the original design intent and information completeness

## Execution Steps

### Step 1: Requirements Analysis
- Understand and analyze the user's request. If it is a simple instruction, first compose a short article based on that instruction.
- For an article provided by the user (or composed by you), read it carefully and understand its overall structure and logic.

### Step 2: Visual Creation
- Extract key concepts, data, or processes from the article and design a clear visual presentation.
- **For complex diagrams (more than ~15 elements)**: plan and generate the diagram in logical sections — for example, generate all nodes first, then add arrows, then add frames. Name each element with a descriptive ID before writing any bindings so cross-references are accurate.
- Use Excalidraw code to render the diagram.

## Best Practices

### Excalidraw Code Standards
- **Arrows/connectors**: Arrows and connectors must be bidirectionally linked to their target elements (i.e., they must bind to element IDs). When two nodes have connections in both directions (A→B and B→A), the return arrow must be offset **20–30px horizontally** from the forward arrow — never place both on the same line. Co-linear opposing arrows are visually indistinguishable.
- **Arrow label typography**: Arrow labels must use \`fontSize\` between **12 and 14**. Never use a font size larger than the labels inside container shapes. Oversized arrow labels overpower the nodes they connect.
- **Element IDs**: Use descriptive, semantic IDs that reflect the element's role in the diagram (e.g. \`"user-submits-form"\`, \`"auth-service"\`, \`"payment-success"\`). Never use generic IDs like \`"rect-1"\` or \`"arrow-3"\`. Descriptive IDs make arrow bindings intentional and prevent cross-element wiring errors.
- **Frames**: For architecture, data flow, sequence, swim lane, and infographic diagrams — group logically related elements into named frames. A frame should represent a bounded concern (e.g. "Frontend", "Auth Service", "Database Layer"). Use frames to create readable section boundaries even when the diagram is viewed at a zoomed-out level. **Never simulate grouping by manually placing smaller elements inside a larger rectangle using coordinates** — this causes the parent rectangle's label to collide with its children. If elements belong together, use a \`frame\` with those elements as children, or use Excalidraw's containment mechanism (\`containerId\`).
- **Coordinate planning**: Anchor the diagram starting at \`x: 100, y: 100\`. Use consistent spacing between elements:
  - Horizontal gap between sibling elements: **200–300px**
  - Vertical gap between rows or levels: **100–150px**
  - For radial layouts (mind maps, concept maps): minimum **250px** radius between center and first ring
  - Keep the first-pass composition inside a **compact canvas** of roughly **1600px width** unless the source content genuinely requires more space
  - For simple diagrams with fewer than about **12 primary elements**, use **2-4 aligned rows/columns** instead of scattering items across the canvas
  - Never overlap elements; plan row and column positions before assigning coordinates
- **Diamond sizing**: Diamond height must be proportional to their text content. For short labels (1–2 lines), keep height at **60–80px maximum**. For longer labels (3–4 lines), cap at **120px**. Never assign arbitrary large heights (e.g. 200px+) to diamonds — they distort the diamond shape and consume excessive canvas space.
- **Element width**: All rectangular elements must have a minimum width of **200 canvas units** regardless of text length. For labels longer than 15 characters, increase width by **10 canvas units per additional character** beyond 15. Never set a rectangle width below 200.
- **Container text sizing**: When a rectangle, ellipse, or diamond contains more than 2 short lines of text, explicitly increase its width and height so the full label fits with whitespace. Summary cards with bullets or 4+ lines should usually be **260–380px wide** and tall enough to avoid any text overlap.
- **Container text properties**: For rectangle, ellipse, and diamond elements, put internal text in \`label.text\` only. Never use a top-level \`text\` property on non-text elements.
- **Text attachment**: Standalone text labels must stay visually attached to the shape, frame, or region they describe. Never leave labels floating far away from their related element.
- **Dense content**: Never stack a title and bullet list into a small node. If a concept needs a heading plus several bullets, either use a larger card-sized container or separate the heading and supporting notes into nearby elements with clear spacing.
- **Visual hierarchy**: Distinguish element importance through size. Primary nodes (main concepts, key steps, central entities) should be noticeably larger than secondary nodes (supporting details, sub-steps, annotations). Tertiary elements (labels, notes, legends) should be smaller still. Size consistency applies within a role — all decision diamonds the same size, all process rectangles the same size — but roles themselves should have distinct sizes.

### Content Accuracy
- Strictly follow the source content — do not add information not mentioned in the original
- Retain all key details, data, and arguments, and preserve the original logical relationships and causal chains

### Visualization Quality
- The diagram should be able to convey information independently; combine text and visuals to explain abstract concepts
- Suitable for educational and explanatory contexts — minimize cognitive load
- **Relationships over lists**: A diagram that shows connections, dependencies, and causality is more valuable than one that lists items as equal-weight nodes. Prefer structures that make relationships visible — arrows that explain *why* they exist (with labels), groupings that show *what belongs together*, and hierarchy that shows *what drives what*.

## Visual Style Guide
- **Style**: Scientific, professional, clear, and concise
- **Text annotations**: Include necessary labels and explanations
- **Color scheme**: Color encodes role, not decoration. Use this semantic system:
  - **Start / trigger nodes**: warm amber/orange tones
  - **Process / action nodes**: blue tones
  - **Decision / condition nodes**: orange tones
  - **End / success / output nodes**: green tones
  - **Error / warning nodes**: red tones
  - **Secondary / supporting nodes**: slate/grey tones
  - Apply 2–4 of these roles per diagram; do not assign colors arbitrarily
- **Whitespace**: Maintain generous whitespace to avoid visual clutter


## ExcalidrawElementSkeleton Elements and Properties

The following lists required and optional properties for ExcalidrawElementSkeleton. The actual elements are auto-completed by the system.

### 1) Rectangle / Ellipse / Diamond (rectangle / ellipse / diamond)
- **Required**: \`type\`, \`x\`, \`y\`
- **Optional**: \`width\`, \`height\`, \`strokeColor\`, \`backgroundColor\`, \`strokeWidth\`, \`strokeStyle\` (solid|dashed|dotted), \`fillStyle\` (hachure|solid|zigzag|cross-hatch), \`roughness\`, \`opacity\`, \`angle\` (rotation angle), \`roundness\` (corner radius), \`locked\`, \`link\`
- **Text container**: Provide \`label.text\` to make it a text container. If \`width/height\` is not provided, container size is auto-calculated from the label text.
  - label optional properties: \`fontSize\`, \`fontFamily\`, \`strokeColor\`, \`textAlign\` (left|center|right), \`verticalAlign\` (top|middle|bottom)

### 2) Text (text)
- **Required**: \`type\`, \`x\`, \`y\`, \`text\`
- **Auto**: \`width\`, \`height\` are auto-calculated by measurement (do not provide manually)
- **Optional**: \`fontSize\`, \`fontFamily\` (1|2|3), \`strokeColor\` (text color), \`opacity\`, \`angle\`, \`textAlign\` (left|center|right), \`verticalAlign\` (top|middle|bottom)

### 3) Line (line)
- **Required**: \`type\`, \`x\`, \`y\`
- **Optional**: \`width\`, \`height\` (default 100×0), \`strokeColor\`, \`strokeWidth\`, \`strokeStyle\`, \`polygon\` (whether closed)
- **Note**: line does not support \`start/end\` binding; \`points\` are always system-generated.

### 4) Arrow (arrow)
- **Required**: \`type\`, \`x\`, \`y\`
- **Optional**: \`width\`, \`height\` (default 100×0), \`strokeColor\`, \`strokeWidth\`, \`strokeStyle\`, \`elbowed\` (elbow arrow)
- **Arrowheads**: \`startArrowhead\`/\`endArrowhead\` options: arrow, bar, circle, circle_outline, triangle, triangle_outline, diamond, diamond_outline (default: end=arrow, start=none)
- **Binding** (arrows only): \`start\`/\`end\` are optional; if provided, must include \`type\` or \`id\`
  - Auto-create via \`type\`: supports rectangle/ellipse/diamond/text (text requires \`text\`)
  - Bind to existing element via \`id\`
  - Optionally provide x/y/width/height; if not provided, they are inferred from arrow position
- **Label**: Provide \`label.text\` to add a label to the arrow
- **Prohibited**: Do not pass \`points\` (the system generates and normalizes them from width/height)

### 5) Freedraw (freedraw)
- **Required**: \`type\`, \`x\`, \`y\`
- **Optional**: \`strokeColor\`, \`strokeWidth\`, \`opacity\`
- **Note**: \`points\` are system-generated; used for hand-drawn style lines.

### 6) Image (image)
- **Required**: \`type\`, \`x\`, \`y\`, \`fileId\`
- **Optional**: \`width\`, \`height\`, \`scale\` (flip), \`crop\`, \`angle\`, \`locked\`, \`link\`

### 7) Frame (frame)
- **Required**: \`type\`, \`children\` (list of element IDs)
- **Optional**: \`x\`, \`y\`, \`width\`, \`height\`, \`name\`
- **Note**: If coordinates/size are not provided, the system auto-calculates them from children with 10px padding.

### 8) Common Properties
- **Grouping**: Use \`groupIds\` array to group multiple elements together
- **Locking**: \`locked: true\` prevents the element from being edited
- **Link**: \`link\` adds a hyperlink to the element

## High-Quality ExcalidrawElementSkeleton Examples

### 1) Basic Shapes
\`\`\`json
[{
  "type": "rectangle",
  "x": 100,
  "y": 200,
  "width": 180,
  "height": 80,
  "backgroundColor": "#e3f2fd",
  "strokeColor": "#1976d2"
}]
\`\`\`

### 2) Text (auto-measured dimensions)
\`\`\`json
[{
  "type": "text",
  "x": 100,
  "y": 100,
  "text": "Heading Text",
  "fontSize": 20
}]
\`\`\`

### 3) Text Container (container size auto-derived from label)
\`\`\`json
[{
  "type": "rectangle",
  "x": 100,
  "y": 150,
  "label": { "text": "Project Management", "fontSize": 18 },
  "backgroundColor": "#e8f5e9"
}]
\`\`\`

### 4) Arrow + Label + Auto-created Binding
\`\`\`json
[{
  "type": "arrow",
  "x": 255,
  "y": 239,
  "label": { "text": "influences" },
  "start": { "type": "rectangle" },
  "end": { "type": "ellipse" },
  "strokeColor": "#2e7d32"
}]
\`\`\`

### 5) Line / Arrow (additional properties)
\`\`\`json
[
  { "type": "arrow", "x": 450, "y": 20, "startArrowhead": "dot", "endArrowhead": "triangle", "strokeColor": "#1971c2", "strokeWidth": 2 },
  { "type": "line", "x": 450, "y": 60, "strokeColor": "#2f9e44", "strokeWidth": 2, "strokeStyle": "dotted" }
]
\`\`\`

### 6) Text Container (advanced layout)
\`\`\`json
[
  { "type": "diamond", "x": -120, "y": 100, "width": 270, "backgroundColor": "#fff3bf", "strokeWidth": 2, "label": { "text": "STYLED DIAMOND TEXT CONTAINER", "strokeColor": "#099268", "fontSize": 20 } },
  { "type": "rectangle", "x": 180, "y": 150, "width": 200, "strokeColor": "#c2255c", "label": { "text": "TOP LEFT ALIGNED RECTANGLE TEXT CONTAINER", "textAlign": "left", "verticalAlign": "top", "fontSize": 20 } },
  { "type": "ellipse", "x": 400, "y": 130, "strokeColor": "#f08c00", "backgroundColor": "#ffec99", "width": 200, "label": { "text": "STYLED ELLIPSE TEXT CONTAINER", "strokeColor": "#c2255c" } }
]
\`\`\`

### 7) Arrow Binding Text Endpoints (via type)
\`\`\`json
{
  "type": "arrow",
  "x": 255,
  "y": 239,
  "start": { "type": "text", "text": "HEYYYYY" },
  "end": { "type": "text", "text": "WHATS UP ?" }
}
\`\`\`

### 8) Binding Existing Elements by ID
\`\`\`json
[
  { "type": "ellipse", "id": "ellipse-1", "strokeColor": "#66a80f", "x": 390, "y": 356, "width": 150, "height": 150, "backgroundColor": "#d8f5a2" },
  { "type": "diamond", "id": "diamond-1", "strokeColor": "#9c36b5", "width": 100, "x": -30, "y": 380 },
  { "type": "arrow", "x": 100, "y": 440, "width": 295, "height": 35, "strokeColor": "#1864ab", "start": { "type": "rectangle", "width": 150, "height": 150 }, "end": { "id": "ellipse-1" } },
  { "type": "arrow", "x": 60, "y": 420, "width": 330, "strokeColor": "#e67700", "start": { "id": "diamond-1" }, "end": { "id": "ellipse-1" } }
]
\`\`\`

### 9) Frame (children required; coordinates/size auto-calculated)
\`\`\`json
[
  { "type": "rectangle", "id": "rect-1", "x": 10, "y": 10 },
  { "type": "diamond", "id": "diamond-1", "x": 120, "y": 20 },
  { "type": "frame", "children": ["rect-1", "diamond-1"], "name": "Feature Module Group" }
]
\`\`\`
`;

// Chart type display names mapping
// Only includes chart types that have corresponding visual specifications
const CHART_TYPE_NAMES = {
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
  infographic: 'Infographic',
};

// Visual specifications for different chart types
const CHART_VISUAL_SPECS = {
  flowchart: `
### Flowchart Visual Specifications
- **Shape conventions**: Use ellipse for start/end, rectangle for process steps, diamond for decisions
- **Connections**: Use arrow to connect nodes; arrows must be bound to elements
- **Layout**: Top-to-bottom or left-to-right flow; maintain a clear directional flow
- **Color**: Use blue as the primary color; highlight decision points in orange`,

  mindmap: `
### Mind Map Visual Specifications
- **Structure**: Central topic uses ellipse; branches use rectangle
- **Hierarchy**: Reflect hierarchy through size and color intensity
- **Layout**: Radial layout with main branches evenly distributed around the center
- **Color**: Use a different color family for each main branch to distinguish topics`,

  orgchart: `
### Org Chart Visual Specifications
- **Shapes**: Use rectangle consistently to represent people or positions
- **Hierarchy**: Reflect rank through color shade and size
- **Layout**: Strict tree hierarchy, top-to-bottom
- **Connections**: Use arrow pointing vertically downward to connect superior and subordinate relationships`,

  sequence: `
### Sequence Diagram Visual Specifications
- **Participants**: Use rectangle at the top to represent each participant
- **Lifelines**: Use dashed line extending downward from each participant
- **Messages**: Use arrow to represent message passing; label with message content
- **Layout**: Participants arranged horizontally; messages ordered top-to-bottom chronologically`,

  class: `
### UML Class Diagram Visual Specifications
- **Classes**: Use rectangle divided into three sections (class name, attributes, methods)
- **Relationships**: Inheritance uses hollow triangle arrowhead; association uses plain arrow; aggregation/composition uses diamond arrowhead
- **Layout**: Parent classes above, child classes below; related classes arranged horizontally`,

  er: `
### ER Diagram Visual Specifications
- **Entities**: Use rectangle to represent entities
- **Attributes**: Use ellipse to represent attributes; mark primary keys with a distinct style
- **Relationships**: Use diamond to represent relationships; connect with arrow
- **Cardinality**: Annotate relationship cardinality on connecting lines (1, N, M, etc.)`,

  gantt: `
### Gantt Chart Visual Specifications
- **Time axis**: Mark time intervals at the top
- **Task bars**: Use rectangle to represent tasks; length represents time span
- **Status**: Use different colors to distinguish task status (not started, in progress, completed)
- **Layout**: Tasks arranged vertically; time unfolds horizontally`,

  timeline: `
### Timeline Visual Specifications
- **Main axis**: Use line as the time axis
- **Nodes**: Use ellipse to mark time points
- **Events**: Use rectangle to display event content
- **Layout**: Time axis centered; event cards alternating on both sides`,

  tree: `
### Tree Diagram Visual Specifications
- **Nodes**: Root node uses ellipse; other nodes use rectangle
- **Hierarchy**: Reflect depth through color gradients
- **Connections**: Use arrow pointing from parent to child
- **Layout**: Root node at the top; child nodes evenly distributed`,

  network: `
### Network Topology Visual Specifications
- **Devices**: Use different shapes for different device types (rectangle, ellipse, diamond); render actual devices as primary nodes and keep VLANs, subnets, gateways, and trunk details as supporting notes rather than pretending they are hardware
- **Hierarchy**: Distinguish device importance through color and size
- **Connections**: Use line to represent network links; line width can represent bandwidth
- **Layout**: Core devices centered; other devices grouped by layer or function`,

  architecture: `
### Architecture Diagram Visual Specifications
- **Layers**: Use rectangle to distinguish different layers (presentation, business, data, etc.)
- **Components**: Use rectangle to represent components or services
- **Layout**: Layered layout, top-to-bottom`,

  dataflow: `
### Data Flow Diagram Visual Specifications
- **Entities**: External entities use rectangle; processes use ellipse
- **Storage**: Data stores use a distinctively styled rectangle
- **Data flows**: Use arrow to indicate data direction; label with data name
- **Layout**: External entities at the edges; processes in the center`,

  state: `
### State Diagram Visual Specifications
- **States**: Use rounded rectangle to represent states
- **Initial/terminal**: Initial state uses a filled circle; terminal state uses a double circle
- **Transitions**: Use arrow to represent state transitions; label with trigger condition
- **Layout**: Arrange according to the logical flow of state transitions`,

  swimlane: `
### Swim Lane Visual Specifications
- **Lanes**: Use rectangle or frame to define lanes; each lane represents a role or department
- **Activities**: Use rectangle for activities; diamond for decisions
- **Flow**: Use arrow to connect activities; flows may cross lanes
- **Layout**: Lanes arranged in parallel; activities ordered chronologically`,

  concept: `
### Concept Map Visual Specifications
- **Concepts**: Core concept uses ellipse; other concepts use rectangle
- **Relationships**: Use arrow to connect concepts; label with relationship type
- **Hierarchy**: Reflect importance through size and color
- **Layout**: Core concept centered; related concepts distributed around it`,

  fishbone: `
### Fishbone Diagram Visual Specifications
- **Spine**: Use a thick arrow as the spine pointing toward the problem or outcome
- **Branches**: Use arrow as branches, angled toward the spine
- **Categories**: Use different colors for main branches to distinguish categories
- **Layout**: Left to right; branches alternating above and below the spine`,

  swot: `
### SWOT Analysis Visual Specifications
- **Four quadrants**: Use rectangle to create four quadrants
- **Categories**: Strengths (S), Weaknesses (W), Opportunities (O), Threats (T) use different colors
- **Content**: List relevant points within each quadrant
- **Layout**: 2×2 matrix layout; all four quadrants equal in size`,

  pyramid: `
### Pyramid Chart Visual Specifications
- **Levels**: Use rectangle for each level; width increases from top to bottom
- **Color**: Use a gradient to reflect hierarchy
- **Layout**: Vertically center-aligned to form a pyramid shape`,

  funnel: `
### Funnel Chart Visual Specifications
- **Levels**: Use rectangle for each stage; width decreases from top to bottom
- **Data**: Annotate each level with counts or percentages
- **Color**: Use a gradient to represent the conversion process
- **Layout**: Vertically centered to form a funnel shape`,

  venn: `
### Venn Diagram Visual Specifications
- **Sets**: Use ellipse to represent sets with partial overlap
- **Color**: Use semi-transparent background colors; intersection areas blend naturally
- **Labels**: Annotate set names and elements
- **Layout**: Circles overlapping appropriately to create a clear intersection area`,

  matrix: `
### Matrix Chart Visual Specifications
- **Grid**: Use rectangle to create row-column grid cells
- **Headers**: Use a darker background to distinguish header cells
- **Data**: Cell color intensity can represent value magnitude
- **Layout**: Clean matrix structure with aligned rows and columns`,

  infographic: `
### Infographic Visual Specifications
- **Modular**: Use frame and rectangle to create independent information modules
- **Visual hierarchy**: Establish clear information hierarchy through size, color, and position
- **Data visualization**: Include charts, icons, numbers, and other visual elements
- **Rich color**: Use multiple colors to distinguish information modules while maintaining visual appeal
- **Text and graphics**: Closely combine text and graphical elements to improve information delivery
- **Flexible layout**: Adopt grid, card, or free layout as needed`,

};

/**
 * Generate user prompt based on input and chart type
 * @param {string} userInput - User's input/requirements
 * @param {string} chartType - Chart type (default: 'flowchart')
 * @returns {string} Complete user prompt
 */
export const USER_PROMPT_TEMPLATE = (userInput, chartType = 'flowchart') => {
  const promptParts = [];

  // Handle chart type specification
  if (chartType) {
    const chartTypeName = CHART_TYPE_NAMES[chartType];

    // Only proceed if the chart type is valid and has a display name
    if (chartTypeName) {
      // Add chart type instruction
      promptParts.push(`Please create an Excalidraw diagram of type: ${chartTypeName}.`);

      // Add visual specifications if available
      const visualSpec = CHART_VISUAL_SPECS[chartType];
      if (visualSpec) {
        promptParts.push(visualSpec.trim());
        promptParts.push(
          `Please strictly follow the visual specifications above when designing the diagram, ensuring:\n` +
          `- You use the shape types and colors specified\n` +
          `- You follow the layout requirements\n` +
          `- You apply the style properties (strokeWidth, fontSize, etc.)\n` +
          `- You maintain visual consistency and a professional appearance`
        );
      }
    }
  }

  // Add user input
  promptParts.push(`User request:\n${userInput}`);

  // Join all parts with double newlines for better readability
  return promptParts.join('\n\n');
};
