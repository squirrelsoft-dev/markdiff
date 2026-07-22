import type { Doc } from "../types";

/**
 * Bundled so the empty state has something to demonstrate on first launch.
 * They carry no path, which is what marks them as unwatchable.
 */

const V1 = `# Orbital Mechanics Primer

A short guide to getting things into space and keeping them there.

## Core concepts

Every orbit is a compromise between speed and altitude. Go faster and you
climb; slow down and you fall. The trick is doing both at once.

- **Apoapsis** — the highest point of an orbit
- **Periapsis** — the lowest point of an orbit
- **Inclination** — the tilt of the orbital plane

## Delta-v budget

| Manoeuvre | Delta-v (m/s) | Notes |
|---|---|---|
| Launch to LEO | 9,400 | Includes drag losses |
| LEO to GTO | 2,440 | Single burn |
| GTO to GEO | 1,470 | Circularisation |

## Worked example

\`\`\`python
def hohmann(r1, r2, mu=3.986e14):
    a = (r1 + r2) / 2
    v1 = (mu / r1) ** 0.5
    return v1 * ((2 * r2 / (r1 + r2)) ** 0.5 - 1)
\`\`\`

## Further reading

See the standard texts. Most of them are older than the Space Shuttle and
none the worse for it.
`;

const V2 = `# Orbital Mechanics Primer

A short guide to getting payloads into space and keeping them there safely.

## Core concepts

Every orbit is a compromise between speed and altitude. Go faster and you
climb; slow down and you fall. The trick is doing both at once, continuously.

- **Apoapsis** — the highest point of an orbit
- **Periapsis** — the lowest point of an orbit
- **Inclination** — the tilt of the orbital plane relative to the equator
- **Eccentricity** — how far the orbit departs from a circle

## Delta-v budget

| Manoeuvre | Delta-v (m/s) | Notes |
|---|---|---|
| Launch to LEO | 9,400 | Includes drag and gravity losses |
| LEO to GTO | 2,440 | Single burn |
| GTO to GEO | 1,470 | Circularisation |
| GEO to graveyard | 11 | End of life |

## Worked example

\`\`\`python
def hohmann(r1, r2, mu=3.986e14):
    """First burn of a Hohmann transfer, in m/s."""
    v1 = (mu / r1) ** 0.5
    return v1 * ((2 * r2 / (r1 + r2)) ** 0.5 - 1)
\`\`\`

## Station keeping

Nothing stays put. Solar pressure, a lumpy geoid and the Moon all conspire
to drag a satellite off station, so plan for correction burns.

## Further reading

See the standard texts. Most of them are older than the Space Shuttle and
none the worse for it.
`;

export function sampleDocuments(): { left: Doc; right: Doc } {
  return {
    left: { path: "", name: "primer-v1.md", content: V1, bytes: V1.length },
    right: { path: "", name: "primer-v2.md", content: V2, bytes: V2.length },
  };
}
