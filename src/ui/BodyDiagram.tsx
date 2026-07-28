import type { HitLocation } from "../core/types";
import { woundLevel } from "../core/wounds";
import { DIAGRAM_VIEWBOX, diagramForLocations } from "./anatomy";

interface Props {
  locations: readonly HitLocation[];
  selectedId: string | null;
  onSelect: (locationId: string) => void;
}

function rangeLabel(range: readonly [number, number]): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
}

/**
 * Clickable body diagram.
 *
 * Each location carries the d20 range that hits it, so the figure doubles as
 * the hit location table: pick where the blow landed by pointing at it instead
 * of reading a row off a list.
 */
export function BodyDiagram({ locations, selectedId, onSelect }: Props) {
  const shapes = diagramForLocations(locations);
  if (!shapes) return null;

  return (
    <svg
      className="diagram"
      viewBox={DIAGRAM_VIEWBOX}
      role="group"
      aria-label="Hit locations"
    >
      {locations.map((location) => {
        const shape = shapes[location.id];
        if (!shape) return null;

        const wound = woundLevel(location);
        const selected = location.id === selectedId;

        return (
          <g key={location.id} className={`region region-${wound}${selected ? " region-selected" : ""}`}>
            <path
              d={shape.path}
              tabIndex={0}
              role="button"
              aria-pressed={selected}
              aria-label={`${location.name}, ${location.hitPoints} of ${location.maxHitPoints} hit points`}
              onClick={() => onSelect(location.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(location.id);
                }
              }}
            />
            {shape.label.leader && (
              <line
                className="leader"
                x1={shape.label.leader[0]}
                y1={shape.label.leader[1]}
                x2={shape.label.leader[2]}
                y2={shape.label.leader[3]}
              />
            )}
            <text
              className="region-label"
              x={shape.label.x}
              y={shape.label.y}
              textAnchor={shape.label.anchor}
            >
              {rangeLabel(location.range)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
