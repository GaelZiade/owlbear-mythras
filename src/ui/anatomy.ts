/**
 * Geometry for the humanoid body diagram.
 *
 * Presentation only, which is why it lives in `ui/` and not in `core/`: the
 * rules know which locations exist and what a d20 roll hits, they do not know
 * what a body looks like. Profiles with no diagram simply fall back to the table.
 *
 * The figure faces the viewer, so the character's right arm is drawn on the
 * viewer's left, the way character sheets have always done it.
 */

export interface DiagramLabel {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  /** Leader line from the shape to the label, as x1 y1 x2 y2. Omitted for labels drawn inside. */
  leader?: readonly [number, number, number, number];
}

export interface DiagramShape {
  path: string;
  label: DiagramLabel;
}

export const DIAGRAM_VIEWBOX = "0 0 200 196";

const HUMANOID_SHAPES: Record<string, DiagramShape> = {
  head: {
    path: "M100,6 C109,6 116,14 116,25 C116,36 109,44 100,44 C91,44 84,36 84,25 C84,14 91,6 100,6 Z",
    label: { x: 126, y: 29, anchor: "start", leader: [117, 25, 124, 25] },
  },
  chest: {
    path: "M78,50 C78,46 82,45 86,45 H114 C118,45 122,46 122,50 L120,86 H80 Z",
    label: { x: 100, y: 70, anchor: "middle" },
  },
  abdomen: {
    path: "M80,88 H120 L117,116 H83 Z",
    label: { x: 100, y: 106, anchor: "middle" },
  },
  "right-arm": {
    path: "M65,52 a6,6 0 0 1 12,0 v62 a6,6 0 0 1 -12,0 z",
    label: { x: 57, y: 91, anchor: "end", leader: [59, 88, 64, 88] },
  },
  "left-arm": {
    path: "M123,52 a6,6 0 0 1 12,0 v62 a6,6 0 0 1 -12,0 z",
    label: { x: 143, y: 91, anchor: "start", leader: [136, 88, 141, 88] },
  },
  "right-leg": {
    path: "M83,118 h15 v64 a7.5,7.5 0 0 1 -15,0 z",
    label: { x: 75, y: 158, anchor: "end", leader: [77, 155, 82, 155] },
  },
  "left-leg": {
    path: "M102,118 h15 v64 a7.5,7.5 0 0 1 -15,0 z",
    label: { x: 125, y: 158, anchor: "start", leader: [118, 155, 123, 155] },
  },
};

const DIAGRAMS: ReadonlyArray<Record<string, DiagramShape>> = [HUMANOID_SHAPES];

/**
 * Finds a diagram that can draw every one of these locations.
 *
 * Matching on the location ids rather than storing a profile id on the
 * combatant keeps this out of the persisted schema: creatures already saved in
 * a room get their diagram without a migration, and anything the diagrams do
 * not cover — a wyvern's wings, a scorpion's claws — falls back to the table
 * instead of drawing a human body with the wrong parts.
 */
export function diagramForLocations(
  locations: ReadonlyArray<{ id: string }>,
): Record<string, DiagramShape> | undefined {
  return DIAGRAMS.find((diagram) => locations.every((location) => location.id in diagram));
}
