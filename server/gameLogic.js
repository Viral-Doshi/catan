/**
 * ============================================================================
 * CATAN GAME LOGIC ENGINE
 * ============================================================================
 * 
 * This module contains the complete game logic for a digital implementation 
 * of the Settlers of Catan board game. It handles:
 * 
 * - Board generation with hexagonal tiles using axial coordinates
 * - Player management and turn flow
 * - Resource distribution based on dice rolls
 * - Building placement (settlements, cities, roads)
 * - Development cards and special actions
 * - Trading (bank trades with port ratios, player-to-player trades)
 * - Victory conditions (10 victory points to win)
 * - Special achievements (Longest Road, Largest Army)
 * 
 * COORDINATE SYSTEM:
 * - Uses axial coordinates (q, r) for hexagonal grid
 * - POINTY-TOP hex orientation
 * - Vertices numbered 0-5 clockwise from top: 0=top, 1=upper-right, 2=lower-right, 3=bottom, 4=lower-left, 5=upper-left
 * - Edges numbered 0-5 clockwise: 0=upper-right, 1=right, 2=lower-right, 3=lower-left, 4=left, 5=upper-left
 * 
 * KEY CONCEPTS:
 * - Equivalent vertices/edges: Same physical position can have different key representations
 * - Each vertex is shared by exactly 3 hexes
 * - Each edge is shared by exactly 2 hexes
 * 
 * @author Viral Doshi
 */

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

/** Available resource types in the game */
export const RESOURCES = {
  BRICK: 'brick',
  LUMBER: 'lumber',
  WOOL: 'wool',
  GRAIN: 'grain',
  ORE: 'ore'
};

/** 
 * Terrain types mapped to their produced resources and display colors
 * Desert produces no resources and is where the robber starts
 */
export const TERRAIN = {
  HILLS: { name: 'hills', resource: RESOURCES.BRICK, color: '#c45a2c' },
  FOREST: { name: 'forest', resource: RESOURCES.LUMBER, color: '#2d5a27' },
  PASTURE: { name: 'pasture', resource: RESOURCES.WOOL, color: '#90c26a' },
  FIELDS: { name: 'fields', resource: RESOURCES.GRAIN, color: '#d4a942' },
  MOUNTAINS: { name: 'mountains', resource: RESOURCES.ORE, color: '#6b6b6b' },
  DESERT: { name: 'desert', resource: null, color: '#e8d5a3' }
};

/** Resource costs for each building/purchase type */
export const BUILDING_COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
  developmentCard: { ore: 1, grain: 1, wool: 1 }
};

/** Types of development cards available */
export const DEV_CARDS = {
  KNIGHT: 'knight',
  VICTORY_POINT: 'victoryPoint',
  ROAD_BUILDING: 'roadBuilding',
  YEAR_OF_PLENTY: 'yearOfPlenty',
  MONOPOLY: 'monopoly'
};

/** 
 * Development card distribution (25 total for standard game)
 * 14 Knights, 5 Victory Points, 2 each of Road Building/Year of Plenty/Monopoly
 */
const DEV_CARD_DISTRIBUTION = [
  ...Array(14).fill(DEV_CARDS.KNIGHT),
  ...Array(5).fill(DEV_CARDS.VICTORY_POINT),
  ...Array(2).fill(DEV_CARDS.ROAD_BUILDING),
  ...Array(2).fill(DEV_CARDS.YEAR_OF_PLENTY),
  ...Array(2).fill(DEV_CARDS.MONOPOLY)
];

/** Player colors: Red, Blue, Orange, Teal, Green, Purple (supports up to 6 players) */
export const PLAYER_COLORS = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#6a994e', '#9d4edd'];

// ============================================================================
// BOARD LAYOUT CONFIGURATION
// ============================================================================

/** 
 * Standard hex positions for 3-4 player game (19 hexes)
 * Uses axial coordinates (q, r) in a hexagonal pattern
 */
const HEX_POSITIONS_STANDARD = [
  // Row 1 (top) - 3 hexes
  { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 },
  // Row 2 - 4 hexes
  { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
  // Row 3 (middle) - 5 hexes
  { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
  // Row 4 - 4 hexes
  { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 },
  // Row 5 (bottom) - 3 hexes
  { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }
];

/** 
 * 5-6 player expansion hex positions (30 hexes total)
 * Larger board arranged as: 3+4+5+6+5+4+3 hexes per row
 */
const HEX_POSITIONS_EXTENDED = [
  // Row 1 (top) - 3 hexes
  { q: 0, r: -3 }, { q: 1, r: -3 }, { q: 2, r: -3 },
  // Row 2 - 4 hexes
  { q: -1, r: -2 }, { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 },
  // Row 3 - 5 hexes
  { q: -2, r: -1 }, { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
  // Row 4 (middle) - 6 hexes
  { q: -3, r: 0 }, { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
  // Row 5 - 5 hexes
  { q: -3, r: 1 }, { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 },
  // Row 6 - 4 hexes
  { q: -3, r: 2 }, { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 },
  // Row 7 (bottom) - 3 hexes
  { q: -3, r: 3 }, { q: -2, r: 3 }, { q: -1, r: 3 }
];

// Standard terrain distribution (19 hexes)
const TERRAIN_DISTRIBUTION_STANDARD = [
  TERRAIN.HILLS, TERRAIN.HILLS, TERRAIN.HILLS,
  TERRAIN.FOREST, TERRAIN.FOREST, TERRAIN.FOREST, TERRAIN.FOREST,
  TERRAIN.PASTURE, TERRAIN.PASTURE, TERRAIN.PASTURE, TERRAIN.PASTURE,
  TERRAIN.FIELDS, TERRAIN.FIELDS, TERRAIN.FIELDS, TERRAIN.FIELDS,
  TERRAIN.MOUNTAINS, TERRAIN.MOUNTAINS, TERRAIN.MOUNTAINS,
  TERRAIN.DESERT
];

// Extended terrain distribution (30 hexes) - adds 11 more hexes
const TERRAIN_DISTRIBUTION_EXTENDED = [
  TERRAIN.HILLS, TERRAIN.HILLS, TERRAIN.HILLS, TERRAIN.HILLS, TERRAIN.HILLS,
  TERRAIN.FOREST, TERRAIN.FOREST, TERRAIN.FOREST, TERRAIN.FOREST, TERRAIN.FOREST, TERRAIN.FOREST,
  TERRAIN.PASTURE, TERRAIN.PASTURE, TERRAIN.PASTURE, TERRAIN.PASTURE, TERRAIN.PASTURE, TERRAIN.PASTURE,
  TERRAIN.FIELDS, TERRAIN.FIELDS, TERRAIN.FIELDS, TERRAIN.FIELDS, TERRAIN.FIELDS, TERRAIN.FIELDS,
  TERRAIN.MOUNTAINS, TERRAIN.MOUNTAINS, TERRAIN.MOUNTAINS, TERRAIN.MOUNTAINS, TERRAIN.MOUNTAINS,
  TERRAIN.DESERT, TERRAIN.DESERT
];

// Number tokens (excluding desert which gets none)
const NUMBER_TOKENS_STANDARD = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// Extended number tokens (28 tokens for 30 hexes - 2 deserts)
const NUMBER_TOKENS_EXTENDED = [
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6,
  8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12
];

// ============================================================================
// PORT CONFIGURATION
// ============================================================================

/** 
 * Port types with their trade ratios
 * Generic ports: 3:1 any resource, Specific ports: 2:1 for that resource
 */
export const PORT_TYPES = {
  GENERIC: { ratio: 3, resource: null, name: '3:1 Port', icon: '⚓' },
  BRICK: { ratio: 2, resource: 'brick', name: 'Brick Port', icon: '🧱' },
  LUMBER: { ratio: 2, resource: 'lumber', name: 'Lumber Port', icon: '🪵' },
  WOOL: { ratio: 2, resource: 'wool', name: 'Wool Port', icon: '🐑' },
  GRAIN: { ratio: 2, resource: 'grain', name: 'Grain Port', icon: '🌾' },
  ORE: { ratio: 2, resource: 'ore', name: 'Ore Port', icon: '⛏️' }
};

// Port positions - each port connects to 2 vertices on the edge of the board
// Format: { vertices: [vKey1, vKey2], type: PORT_TYPE }
const PORT_POSITIONS_STANDARD = [
  // Top edge ports
  { vertices: ['v_0_-2_0', 'v_0_-2_5'], type: 'GENERIC' },
  { vertices: ['v_1_-2_0', 'v_1_-2_1'], type: 'GRAIN' },
  // Right edge ports
  { vertices: ['v_2_-2_1', 'v_2_-2_2'], type: 'ORE' },
  { vertices: ['v_2_-1_2', 'v_2_0_1'], type: 'GENERIC' },
  { vertices: ['v_2_0_2', 'v_2_0_3'], type: 'WOOL' },
  // Bottom edge ports
  { vertices: ['v_1_1_2', 'v_1_1_3'], type: 'GENERIC' },
  { vertices: ['v_0_2_3', 'v_0_2_4'], type: 'GENERIC' },
  // Left edge ports
  { vertices: ['v_-2_2_3', 'v_-2_2_4'], type: 'BRICK' },
  { vertices: ['v_-2_0_4', 'v_-2_0_5'], type: 'LUMBER' }
];

// Extended port positions for 5-6 players (11 ports)
const PORT_POSITIONS_EXTENDED = [
  // Top edge ports
  { vertices: ['v_0_-3_0', 'v_0_-3_5'], type: 'GENERIC' },
  { vertices: ['v_1_-3_0', 'v_1_-3_1'], type: 'GRAIN' },
  { vertices: ['v_2_-3_1', 'v_2_-3_2'], type: 'ORE' },
  // Right edge ports
  { vertices: ['v_2_-2_2', 'v_2_-1_1'], type: 'GENERIC' },
  { vertices: ['v_2_-1_2', 'v_2_0_1'], type: 'WOOL' },
  { vertices: ['v_2_0_2', 'v_1_1_1'], type: 'GENERIC' },
  // Bottom edge ports
  { vertices: ['v_0_2_2', 'v_0_2_3'], type: 'BRICK' },
  { vertices: ['v_-1_3_3', 'v_-2_3_2'], type: 'GENERIC' },
  { vertices: ['v_-3_3_3', 'v_-3_3_4'], type: 'LUMBER' },
  // Left edge ports
  { vertices: ['v_-3_2_4', 'v_-3_1_3'], type: 'GENERIC' },
  { vertices: ['v_-3_0_4', 'v_-3_0_5'], type: 'GENERIC' }
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Fisher-Yates shuffle algorithm - returns a new shuffled array */
function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// KEY GENERATION FUNCTIONS
// ============================================================================

/** Generate a unique key for a hex tile at axial coordinates (q, r) */
export function hexKey(q, r) {
  return `${q},${r}`;
}

/** 
 * Generate a unique key for a vertex (corner of a hex)
 * @param hexQ - Q coordinate of the reference hex
 * @param hexR - R coordinate of the reference hex  
 * @param direction - Vertex position (0-5, clockwise from top)
 */
export function vertexKey(hexQ, hexR, direction) {
  return `v_${hexQ}_${hexR}_${direction}`;
}

/** 
 * Generate a unique key for an edge (side of a hex)
 * @param hexQ - Q coordinate of the reference hex
 * @param hexR - R coordinate of the reference hex
 * @param direction - Edge position (0-5, clockwise from upper-right)
 */
export function edgeKey(hexQ, hexR, direction) {
  return `e_${hexQ}_${hexR}_${direction}`;
}

// ============================================================================
// COORDINATE SYSTEM - VERTEX AND EDGE RELATIONSHIPS
// ============================================================================

/** 
 * Get all 6 vertices of a hex tile
 * POINTY-TOP orientation: 0=top, 1=upper-right, 2=lower-right, 3=bottom, 4=lower-left, 5=upper-left
 */
export function getHexVertices(q, r) {
  return [
    vertexKey(q, r, 0), // top
    vertexKey(q, r, 1), // upper-right
    vertexKey(q, r, 2), // lower-right
    vertexKey(q, r, 3), // bottom
    vertexKey(q, r, 4), // lower-left
    vertexKey(q, r, 5)  // upper-left
  ];
}

/** 
 * Normalize a vertex to its canonical key representation
 * Since vertices are shared by 3 hexes, this ensures consistent lookups
 */
export function normalizeVertex(hexQ, hexR, dir, hexes) {
  // Canonical form: use smallest hex coordinates
  const candidates = getEquivalentVertices(hexQ, hexR, dir);
  for (const c of candidates) {
    if (hexes[hexKey(c.q, c.r)]) {
      return vertexKey(c.q, c.r, c.dir);
    }
  }
  return vertexKey(hexQ, hexR, dir);
}

/** 
 * Get all equivalent representations of a vertex position
 * 
 * IMPORTANT: Each physical vertex is shared by exactly 3 hexes, so it can be 
 * referenced using 3 different (hex, direction) combinations.
 * 
 * This function returns all 3 equivalent representations for a given vertex,
 * enabling proper collision detection and connectivity checks.
 * 
 * Verified by pixel position calculations to ensure geometric accuracy.
 * 
 * @param q - Q coordinate of hex
 * @param r - R coordinate of hex
 * @param dir - Vertex direction (0-5)
 * @returns Array of equivalent vertex representations {q, r, dir}
 */
function getEquivalentVertices(q, r, dir) {
  const equivalents = [
    { q, r, dir }
  ];
  
  // POINTY-TOP: vertex sharing based on direction (verified with pixel positions)
  if (dir === 0) { // top - shared with (q, r-1) vertex 2 and (q+1, r-1) vertex 4
    equivalents.push({ q: q, r: r - 1, dir: 2 });
    equivalents.push({ q: q + 1, r: r - 1, dir: 4 });
  } else if (dir === 1) { // upper-right - shared with (q+1, r-1) vertex 3 and (q+1, r) vertex 5
    equivalents.push({ q: q + 1, r: r - 1, dir: 3 });
    equivalents.push({ q: q + 1, r: r, dir: 5 });
  } else if (dir === 2) { // lower-right - shared with (q+1, r) vertex 4 and (q, r+1) vertex 0
    equivalents.push({ q: q + 1, r: r, dir: 4 });
    equivalents.push({ q: q, r: r + 1, dir: 0 });
  } else if (dir === 3) { // bottom - shared with (q, r+1) vertex 5 and (q-1, r+1) vertex 1
    equivalents.push({ q: q, r: r + 1, dir: 5 });
    equivalents.push({ q: q - 1, r: r + 1, dir: 1 });
  } else if (dir === 4) { // lower-left - shared with (q-1, r+1) vertex 0 and (q-1, r) vertex 2
    equivalents.push({ q: q - 1, r: r + 1, dir: 0 });
    equivalents.push({ q: q - 1, r: r, dir: 2 });
  } else if (dir === 5) { // upper-left - shared with (q-1, r) vertex 1 and (q, r-1) vertex 3
    equivalents.push({ q: q - 1, r: r, dir: 1 });
    equivalents.push({ q: q, r: r - 1, dir: 3 });
  }
  
  return equivalents;
}

/** 
 * Check if two vertex keys refer to the same physical vertex position
 * Handles the case where same vertex is referenced from different hexes
 */
export function areVerticesEqual(vKey1, vKey2) {
  if (vKey1 === vKey2) return true;
  
  const match1 = vKey1.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  const match2 = vKey2.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match1 || !match2) return false;
  
  const q1 = parseInt(match1[1]), r1 = parseInt(match1[2]), dir1 = parseInt(match1[3]);
  const q2 = parseInt(match2[1]), r2 = parseInt(match2[2]), dir2 = parseInt(match2[3]);
  
  // Get all equivalent vertices for vKey1 and check if vKey2 matches any
  const equivalents = getEquivalentVertices(q1, r1, dir1);
  return equivalents.some(eq => eq.q === q2 && eq.r === r2 && eq.dir === dir2);
}

// ============================================================================
// BUILDING AND ROAD LOOKUP FUNCTIONS
// ============================================================================

/** 
 * Check if a specific player has a building at a vertex
 * Checks all equivalent vertex keys to handle shared vertices
 */
function hasPlayerBuildingAtVertex(game, vKey, playerIndex) {
  const match = vKey.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return false;
  
  const q = parseInt(match[1]), r = parseInt(match[2]), dir = parseInt(match[3]);
  const equivalents = getEquivalentVertices(q, r, dir);
  
  // Check all equivalent vertex keys for a building owned by the player
  for (const eq of equivalents) {
    const eqKey = vertexKey(eq.q, eq.r, eq.dir);
    const vertex = game.vertices[eqKey];
    if (vertex?.owner === playerIndex && vertex?.building) {
      return true;
    }
  }
  return false;
}

/** Check if ANY building exists at a vertex (for distance rule validation) */
function hasBuildingAtVertex(game, vKey) {
  const match = vKey.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return false;
  
  const q = parseInt(match[1]), r = parseInt(match[2]), dir = parseInt(match[3]);
  const equivalents = getEquivalentVertices(q, r, dir);
  
  // Check all equivalent vertex keys for any building
  for (const eq of equivalents) {
    const eqKey = vertexKey(eq.q, eq.r, eq.dir);
    const vertex = game.vertices[eqKey];
    if (vertex?.building) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// GEOMETRY CALCULATIONS (for physical position verification)
// ============================================================================

const HEX_SIZE = 50; // Base hex size for calculations

/** 
 * Calculate pixel position for a vertex
 * Used for verifying vertex equivalence and adjacency via actual geometric positions
 * Must match the client-side rendering formula
 */
function getVertexPixelPosition(q, r, dir) {
  // Axial to pixel (pointy-top)
  const centerX = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const centerY = HEX_SIZE * (3 / 2) * r;
  
  // Vertex angles for pointy-top hex
  const angles = [90, 30, -30, -90, -150, 150];
  const angle = angles[dir] * Math.PI / 180;
  
  return {
    x: centerX + HEX_SIZE * Math.cos(angle),
    y: centerY - HEX_SIZE * Math.sin(angle)
  };
}

/** 
 * Check if two vertices are physically adjacent (share an edge)
 * Uses pixel positions to verify - adjacent vertices are exactly HEX_SIZE apart
 */
function areVerticesAdjacent(vKey1, vKey2) {
  const match1 = vKey1.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  const match2 = vKey2.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match1 || !match2) return false;
  
  const pos1 = getVertexPixelPosition(
    parseInt(match1[1]), parseInt(match1[2]), parseInt(match1[3])
  );
  const pos2 = getVertexPixelPosition(
    parseInt(match2[1]), parseInt(match2[2]), parseInt(match2[3])
  );
  
  // Calculate distance between vertices
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Adjacent vertices are exactly HEX_SIZE apart (edge length)
  // Use a small tolerance for floating point errors
  return Math.abs(distance - HEX_SIZE) < 1;
}

/** 
 * Check if any building is adjacent to a vertex (for distance rule)
 * Catan rules require settlements to be at least 2 edges apart
 */
function hasAdjacentBuilding(game, vKey) {
  // Get all vertices with buildings
  for (const [otherKey, vertex] of Object.entries(game.vertices)) {
    if (vertex?.building) {
      // Check if this building is at the same position (equivalent vertex)
      if (areVerticesAtSamePosition(vKey, otherKey)) {
        continue; // Skip - this is the same vertex, not adjacent
      }
      // Check if this building is adjacent
      if (areVerticesAdjacent(vKey, otherKey)) {
        return true;
      }
    }
  }
  return false;
}

/** Check if two vertex keys refer to the same physical position using pixel coordinates */
function areVerticesAtSamePosition(vKey1, vKey2) {
  const match1 = vKey1.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  const match2 = vKey2.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match1 || !match2) return false;
  
  const pos1 = getVertexPixelPosition(
    parseInt(match1[1]), parseInt(match1[2]), parseInt(match1[3])
  );
  const pos2 = getVertexPixelPosition(
    parseInt(match2[1]), parseInt(match2[2]), parseInt(match2[3])
  );
  
  // Same position if very close
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  return distance < 1;
}

/** 
 * Find a building at a hex vertex, checking all equivalent vertex keys
 * Returns building info including the actual vertex key where it was found
 * Used for resource distribution to find all adjacent buildings
 */
function findBuildingAtHexVertex(game, q, r, dir) {
  const equivalents = getEquivalentVertices(q, r, dir);
  
  for (const eq of equivalents) {
    const vKey = vertexKey(eq.q, eq.r, eq.dir);
    const vertex = game.vertices[vKey];
    if (vertex && vertex.building) {
      return { owner: vertex.owner, type: vertex.building, vertexKey: vKey };
    }
  }
  return null;
}

/** 
 * Get all equivalent representations of an edge position
 * Each edge is shared by exactly 2 hexes, so it has 2 different key representations
 */
export function getEquivalentEdges(q, r, dir) {
  const equivalents = [{ q, r, dir }];
  
  // POINTY-TOP: edge sharing based on direction
  if (dir === 0) { // upper-right edge - shared with (q+1, r-1) edge 3
    equivalents.push({ q: q + 1, r: r - 1, dir: 3 });
  } else if (dir === 1) { // right edge - shared with (q+1, r) edge 4
    equivalents.push({ q: q + 1, r: r, dir: 4 });
  } else if (dir === 2) { // lower-right edge - shared with (q, r+1) edge 5
    equivalents.push({ q: q, r: r + 1, dir: 5 });
  } else if (dir === 3) { // lower-left edge - shared with (q-1, r+1) edge 0
    equivalents.push({ q: q - 1, r: r + 1, dir: 0 });
  } else if (dir === 4) { // left edge - shared with (q-1, r) edge 1
    equivalents.push({ q: q - 1, r: r, dir: 1 });
  } else if (dir === 5) { // upper-left edge - shared with (q, r-1) edge 2
    equivalents.push({ q: q, r: r - 1, dir: 2 });
  }
  
  return equivalents;
}

/** 
 * Check if a road exists at an edge (checking all equivalent edge keys)
 * Returns road info if found, null otherwise
 */
function hasRoadAtEdge(game, eKey) {
  const match = eKey.match(/e_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return null;
  
  const q = parseInt(match[1]), r = parseInt(match[2]), dir = parseInt(match[3]);
  const equivalents = getEquivalentEdges(q, r, dir);
  
  for (const eq of equivalents) {
    const eqKey = edgeKey(eq.q, eq.r, eq.dir);
    const edge = game.edges[eqKey];
    if (edge?.road) {
      return { road: true, owner: edge.owner, key: eqKey };
    }
  }
  return null;
}

/** Check if a specific player has a road at an edge */
function hasPlayerRoadAtEdge(game, eKey, playerIndex) {
  const roadInfo = hasRoadAtEdge(game, eKey);
  return roadInfo && roadInfo.owner === playerIndex;
}

/** 
 * Get the 3 edges touching a vertex from one hex's perspective
 * 
 * Each vertex has exactly 3 edges. From a single hex, we can identify:
 * - 2 edges on this hex
 * - 1 edge on a neighboring hex (the "third unique edge")
 * 
 * Edge direction: 0=upper-right, 1=right, 2=lower-right, 3=lower-left, 4=left, 5=upper-left
 * Verified by algebraic edge equivalence calculations.
 */
function getVertexEdgesFromHex(q, r, dir) {
  const edges = [];
  
  // POINTY-TOP vertex to edge mapping
  // For each vertex: two edges from this hex + one unique edge from neighbors
  // The third edge is calculated to NOT be equivalent to the first two
  if (dir === 0) { // top vertex
    edges.push(edgeKey(q, r, 5)); // e_5 (connects v5-v0)
    edges.push(edgeKey(q, r, 0)); // e_0 (connects v0-v1)
    edges.push(edgeKey(q, r - 1, 1)); // third unique: e_1 of (q, r-1) = e_4 of (q+1, r-1)
  } else if (dir === 1) { // upper-right vertex
    edges.push(edgeKey(q, r, 0)); // e_0 (connects v0-v1)
    edges.push(edgeKey(q, r, 1)); // e_1 (connects v1-v2)
    edges.push(edgeKey(q + 1, r - 1, 2)); // third unique: e_2 of (q+1, r-1) = e_5 of (q+1, r)
  } else if (dir === 2) { // lower-right vertex
    edges.push(edgeKey(q, r, 1)); // e_1 (connects v1-v2)
    edges.push(edgeKey(q, r, 2)); // e_2 (connects v2-v3)
    edges.push(edgeKey(q + 1, r, 3)); // third unique: e_3 of (q+1, r) = e_0 of (q, r+1)
  } else if (dir === 3) { // bottom vertex
    edges.push(edgeKey(q, r, 2)); // e_2 (connects v2-v3)
    edges.push(edgeKey(q, r, 3)); // e_3 (connects v3-v4)
    edges.push(edgeKey(q, r + 1, 4)); // third unique: e_4 of (q, r+1) = e_1 of (q-1, r+1)
  } else if (dir === 4) { // lower-left vertex
    edges.push(edgeKey(q, r, 3)); // e_3 (connects v3-v4)
    edges.push(edgeKey(q, r, 4)); // e_4 (connects v4-v5)
    edges.push(edgeKey(q - 1, r + 1, 5)); // third unique: e_5 of (q-1, r+1) = e_2 of (q-1, r)
  } else if (dir === 5) { // upper-left vertex
    edges.push(edgeKey(q, r, 4)); // e_4 (connects v4-v5)
    edges.push(edgeKey(q, r, 5)); // e_5 (connects v5-v0)
    edges.push(edgeKey(q - 1, r, 0)); // third unique: e_0 of (q-1, r) = e_3 of (q, r-1)
  }
  
  return edges;
}

/** 
 * Get ALL edges adjacent to a vertex (exactly 3 edges per vertex)
 * Aggregates edges from all equivalent vertex representations and deduplicates
 */
export function getVertexEdges(vKey) {
  const match = vKey.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return [];
  
  const q = parseInt(match[1]);
  const r = parseInt(match[2]);
  const dir = parseInt(match[3]);
  
  // Get all equivalent vertex representations
  const equivalentVertices = getEquivalentVertices(q, r, dir);
  
  // Helper to get canonical edge key for deduplication
  function getCanonicalEdgeKey(eKey) {
    const eMatch = eKey.match(/e_(-?\d+)_(-?\d+)_(\d+)/);
    if (!eMatch) return eKey;
    const equivs = getEquivalentEdges(parseInt(eMatch[1]), parseInt(eMatch[2]), parseInt(eMatch[3]));
    // Use the edge key with smallest coordinates as canonical
    equivs.sort((a, b) => a.q - b.q || a.r - b.r || a.dir - b.dir);
    return edgeKey(equivs[0].q, equivs[0].r, equivs[0].dir);
  }
  
  // Collect all edges from all equivalent vertices, using canonical keys to prevent duplicates
  const canonicalEdges = new Map(); // canonical key -> original key
  
  for (const v of equivalentVertices) {
    const edges = getVertexEdgesFromHex(v.q, v.r, v.dir);
    for (const e of edges) {
      const canonical = getCanonicalEdgeKey(e);
      if (!canonicalEdges.has(canonical)) {
        canonicalEdges.set(canonical, e);
      }
    }
  }
  
  // Return the original edge keys (not canonical) for compatibility
  return Array.from(canonicalEdges.values());
}

/** 
 * Get all adjacent vertices (connected by an edge)
 * 
 * Each vertex has exactly 3 adjacent vertices:
 * - 2 on the same hex (directions +1 and -1)
 * - 1 on a neighboring hex (at the other end of the third edge)
 * 
 * Used for the distance rule check during settlement placement.
 * Verified by pixel position calculations and edge connectivity.
 */
export function getAdjacentVertices(vKey, hexes) {
  const match = vKey.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return [];
  
  const q = parseInt(match[1]);
  const r = parseInt(match[2]);
  const dir = parseInt(match[3]);
  
  const adjacent = [];
  
  // Each vertex has exactly 3 adjacent vertices (connected by edges)
  // Two are on the same hex, one is on a neighboring hex
  const nextDir = (dir + 1) % 6;
  const prevDir = (dir + 5) % 6;
  
  adjacent.push(vertexKey(q, r, nextDir));
  adjacent.push(vertexKey(q, r, prevDir));
  
  // Third adjacent vertex on a neighboring hex (POINTY-TOP)
  // Logic: Get the third edge from getVertexEdgesFromHex, find the vertex at its OTHER end
  // Each edge connects two vertices that are +1/-1 apart in direction
  //
  // For vertex dir on hex (q,r), equivalent vertex is on neighbor hex:
  //   dir 0 → equiv (q, r-1) dir 2 → third edge e_1 of (q,r-1) connects v1-v2 → other end is v1
  //   dir 1 → equiv (q+1, r-1) dir 3 → third edge e_2 of (q+1,r-1) connects v2-v3 → other end is v2
  //   dir 2 → equiv (q+1, r) dir 4 → third edge e_3 of (q+1,r) connects v3-v4 → other end is v3
  //   dir 3 → equiv (q, r+1) dir 5 → third edge e_4 of (q,r+1) connects v4-v5 → other end is v4
  //   dir 4 → equiv (q-1, r+1) dir 0 → third edge e_5 of (q-1,r+1) connects v5-v0 → other end is v5
  //   dir 5 → equiv (q-1, r) dir 1 → third edge e_0 of (q-1,r) connects v0-v1 → other end is v0
  if (dir === 0) adjacent.push(vertexKey(q, r - 1, 1));
  else if (dir === 1) adjacent.push(vertexKey(q + 1, r - 1, 2));
  else if (dir === 2) adjacent.push(vertexKey(q + 1, r, 3));
  else if (dir === 3) adjacent.push(vertexKey(q, r + 1, 4));
  else if (dir === 4) adjacent.push(vertexKey(q - 1, r + 1, 5));
  else if (dir === 5) adjacent.push(vertexKey(q - 1, r, 0));
  
  return adjacent;
}

// ============================================================================
// GAME STATE MANAGEMENT
// ============================================================================

/** 
 * Create a new game with initial state
 * 
 * @param gameId - Unique game identifier (usually a 6-char code)
 * @param hostPlayer - Player object {id, name} for the host
 * @param isExtended - Whether to use 5-6 player expansion board
 * @param enableSpecialBuild - Whether to enable special building phase (5-6 player rule)
 * @returns Complete game state object
 */
export function createGame(gameId, hostPlayer, isExtended = false, enableSpecialBuild = true) {
  // Select board configuration based on game mode
  const HEX_POSITIONS = isExtended ? HEX_POSITIONS_EXTENDED : HEX_POSITIONS_STANDARD;
  const TERRAIN_DISTRIBUTION = isExtended ? TERRAIN_DISTRIBUTION_EXTENDED : TERRAIN_DISTRIBUTION_STANDARD;
  const NUMBER_TOKENS = isExtended ? NUMBER_TOKENS_EXTENDED : NUMBER_TOKENS_STANDARD;
  const PORT_POSITIONS = isExtended ? PORT_POSITIONS_EXTENDED : PORT_POSITIONS_STANDARD;
  const MAX_PLAYERS = isExtended ? 6 : 4;
  
  // Extended game has more development cards
  const devCards = isExtended 
    ? [...DEV_CARD_DISTRIBUTION, ...DEV_CARD_DISTRIBUTION.slice(0, 9)] // Add 9 more cards (34 total)
    : [...DEV_CARD_DISTRIBUTION];
  
  // Shuffle terrain and numbers
  const shuffledTerrain = shuffle(TERRAIN_DISTRIBUTION);
  const shuffledNumbers = shuffle(NUMBER_TOKENS);
  
  const hexes = {};
  let numberIndex = 0;
  let desertHex = null;
  
  HEX_POSITIONS.forEach((pos, i) => {
    const terrain = shuffledTerrain[i];
    const key = hexKey(pos.q, pos.r);
    
    hexes[key] = {
      q: pos.q,
      r: pos.r,
      terrain: terrain.name,
      resource: terrain.resource,
      color: terrain.color,
      number: terrain.name === 'desert' ? null : shuffledNumbers[numberIndex++]
    };
    
    if (terrain.name === 'desert') {
      desertHex = key;
    }
  });
  
  // Create vertex and edge maps
  const vertices = {};
  const edges = {};
  
  // Initialize all valid vertices and edges
  Object.keys(hexes).forEach(hKey => {
    const hex = hexes[hKey];
    for (let dir = 0; dir < 6; dir++) {
      const vKey = vertexKey(hex.q, hex.r, dir);
      if (!vertices[vKey]) {
        vertices[vKey] = { building: null, owner: null };
      }
      const eKey = edgeKey(hex.q, hex.r, dir);
      if (!edges[eKey]) {
        edges[eKey] = { road: false, owner: null };
      }
    }
  });
  
  // Create ports
  const ports = PORT_POSITIONS.map((portPos, idx) => ({
    id: idx,
    vertices: portPos.vertices,
    type: portPos.type,
    ...PORT_TYPES[portPos.type]
  }));

  return {
    id: gameId,
    phase: 'waiting', // waiting, setup, playing, finished
    setupPhase: 0, // 0: first settlements, 1: second settlements (reverse)
    currentPlayerIndex: 0,
    turnPhase: 'roll', // roll, main, robber, discard, specialBuild
    isExtended, // 5-6 player extension flag
    maxPlayers: MAX_PLAYERS,
    enableSpecialBuild, // Whether special building phase is enabled (optional rule)
    specialBuildingPhase: false, // True during special building phase
    specialBuildIndex: 0, // Which player is currently in special build phase
    ports, // Port locations and types
    players: [{
      id: hostPlayer.id,
      name: hostPlayer.name,
      color: PLAYER_COLORS[0],
      turnOrder: null, // Will be set when game starts
      resources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 },
      developmentCards: [],
      newDevCards: [], // Cards bought this turn (can't be played)
      knightsPlayed: 0,
      victoryPoints: 0,
      hiddenVictoryPoints: 0, // VP from dev cards (secret until win)
      settlements: 5,
      cities: 4,
      roads: 15,
      hasLongestRoad: false,
      hasLargestArmy: false,
      roadLength: 0
    }],
    hexes,
    vertices,
    edges,
    robber: desertHex,
    devCardDeck: shuffle(devCards),
    longestRoadPlayer: null,
    longestRoadLength: 4, // Must have at least 5 to claim
    largestArmyPlayer: null,
    largestArmySize: 2, // Must have at least 3 to claim
    diceRoll: null,
    winner: null,
    tradeOffer: null,
    discardingPlayers: [],
    freeRoads: 0, // For road building card
    yearOfPlentyPicks: 0, // For year of plenty card
    devCardPlayedThisTurn: false, // Can only play one dev card per turn
    hasRolledThisTurn: false // Track if dice have been rolled (for dev card + robber flow)
  };
}

/** Add a player to an existing game (before game starts) */
export function addPlayer(game, player) {
  const maxPlayers = game.maxPlayers || 4;
  if (game.players.length >= maxPlayers) {
    return { success: false, error: 'Game is full' };
  }
  
  if (game.phase !== 'waiting') {
    return { success: false, error: 'Game already started' };
  }
  
  game.players.push({
    id: player.id,
    name: player.name,
    color: PLAYER_COLORS[game.players.length],
    turnOrder: null, // Will be set when game starts
    resources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 },
    developmentCards: [],
    newDevCards: [],
    knightsPlayed: 0,
    victoryPoints: 0,
    hiddenVictoryPoints: 0, // VP from dev cards (secret until win)
    settlements: 5,
    cities: 4,
    roads: 15,
    hasLongestRoad: false,
    hasLargestArmy: false,
    roadLength: 0
  });
  
  return { success: true };
}

/** 
 * Start the game - randomizes player order and begins setup phase
 * Requires at least 2 players
 */
export function startGame(game) {
  if (game.players.length < 2) {
    return { success: false, error: 'Need at least 2 players' };
  }
  
  // Randomize player order
  const playerOrder = game.players.map((_, idx) => idx);
  for (let i = playerOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerOrder[i], playerOrder[j]] = [playerOrder[j], playerOrder[i]];
  }
  
  // Reorder players and assign turn numbers
  const reorderedPlayers = playerOrder.map((oldIdx, newIdx) => {
    const player = game.players[oldIdx];
    player.turnOrder = newIdx + 1;
    player.color = PLAYER_COLORS[newIdx]; // Reassign colors based on new order
    return player;
  });
  game.players = reorderedPlayers;
  
  game.phase = 'setup';
  game.setupPhase = 0;
  game.currentPlayerIndex = 0;
  
  return { success: true, turnOrder: game.players.map(p => ({ id: p.id, name: p.name, turnOrder: p.turnOrder })) };
}

/** Shuffle the board layout - only allowed before game starts */
export function shuffleBoard(game) {
  if (game.phase !== 'waiting') {
    return { success: false, error: 'Can only shuffle before game starts' };
  }
  
  // Select distributions based on game mode
  const TERRAIN_DISTRIBUTION = game.isExtended ? TERRAIN_DISTRIBUTION_EXTENDED : TERRAIN_DISTRIBUTION_STANDARD;
  const NUMBER_TOKENS = game.isExtended ? NUMBER_TOKENS_EXTENDED : NUMBER_TOKENS_STANDARD;
  const HEX_POSITIONS = game.isExtended ? HEX_POSITIONS_EXTENDED : HEX_POSITIONS_STANDARD;
  
  // Shuffle terrain and numbers
  const shuffledTerrain = shuffle(TERRAIN_DISTRIBUTION);
  const shuffledNumbers = shuffle(NUMBER_TOKENS);
  
  let numberIndex = 0;
  let desertHex = null;
  
  HEX_POSITIONS.forEach((pos, i) => {
    const terrain = shuffledTerrain[i];
    const key = hexKey(pos.q, pos.r);
    
    game.hexes[key] = {
      q: pos.q,
      r: pos.r,
      terrain: terrain.name,
      resource: terrain.resource,
      color: terrain.color,
      number: terrain.name === 'desert' ? null : shuffledNumbers[numberIndex++]
    };
    
    if (terrain.name === 'desert') {
      desertHex = key;
    }
  });
  
  game.robber = desertHex;
  
  return { success: true };
}

// ============================================================================
// TURN ACTIONS
// ============================================================================

/** 
 * Roll dice at the start of a turn
 * - Rolling 7 triggers discard phase (if anyone has >7 cards) then robber movement
 * - Other numbers distribute resources to players with adjacent buildings
 */
export function rollDice(game, playerId) {
  const player = game.players[game.currentPlayerIndex];
  
  if (player.id !== playerId) {
    return { success: false, error: 'Not your turn' };
  }
  
  if (game.turnPhase !== 'roll') {
    return { success: false, error: 'Cannot roll now' };
  }
  
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;
  
  game.diceRoll = { die1, die2, total };
  game.hasRolledThisTurn = true;
  
  if (total === 7) {
    // Check if any player has more than 7 cards
    const playersToDiscard = [];
    game.players.forEach((p, idx) => {
      const totalCards = Object.values(p.resources).reduce((a, b) => a + b, 0);
      if (totalCards > 7) {
        playersToDiscard.push({
          playerIndex: idx,
          cardsToDiscard: Math.floor(totalCards / 2)
        });
      }
    });
    
    if (playersToDiscard.length > 0) {
      game.turnPhase = 'discard';
      game.discardingPlayers = playersToDiscard;
    } else {
      game.turnPhase = 'robber';
    }
    return { success: true, roll: game.diceRoll, resourceGains: null };
  } else {
    // Distribute resources
    const gains = distributeResources(game, total);
    game.turnPhase = 'main';
    return { success: true, roll: game.diceRoll, resourceGains: gains };
  }
}

/** 
 * Distribute resources based on dice roll
 * 
 * For each hex with matching number (not blocked by robber):
 * - Find all buildings on adjacent vertices
 * - Give 1 resource per settlement, 2 per city
 * 
 * IMPORTANT: Uses hex-vertex deduplication to prevent double-counting
 * but allows a settlement at intersection of 2 same-resource hexes to get both.
 * 
 * @returns Object mapping playerIndex to resources gained
 */
function distributeResources(game, roll) {
  // Track what each player receives
  const gains = {};
  game.players.forEach((_, idx) => {
    gains[idx] = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
  });
  
  // Track which (hex, physical_vertex) combinations have already been processed
  // This prevents double-counting the same vertex for the SAME hex (which shouldn't happen anyway)
  // But we DO want to count the same vertex for DIFFERENT hexes (that's the Catan rule!)
  const processedHexVertices = new Set();
  
  Object.entries(game.hexes).forEach(([hKey, hex]) => {
    if (hex.number === roll && hKey !== game.robber) {
      // Find all settlements/cities adjacent to this hex
      for (let dir = 0; dir < 6; dir++) {
        const buildingInfo = findBuildingAtHexVertex(game, hex.q, hex.r, dir);
        
        if (buildingInfo && buildingInfo.owner !== null && hex.resource) {
          // Create a unique key for this HEX-VERTEX combination
          // This prevents the same hex from giving resources to the same vertex twice
          // (which could happen if we find the same building under different vertex key formats)
          const hexVertexKey = `${hKey},${buildingInfo.vertexKey}`;
          if (processedHexVertices.has(hexVertexKey)) continue;
          processedHexVertices.add(hexVertexKey);
          
          const player = game.players[buildingInfo.owner];
          const amount = buildingInfo.type === 'city' ? 2 : 1;
          player.resources[hex.resource] += amount;
          gains[buildingInfo.owner][hex.resource] += amount;
        }
      }
    }
  });
  
  return gains;
}

/** 
 * Discard cards when a 7 is rolled
 * Players with more than 7 cards must discard half (rounded down)
 */
export function discardCards(game, playerId, resources) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found' };
  }
  
  const discardInfo = game.discardingPlayers.find(d => d.playerIndex === playerIndex);
  if (!discardInfo) {
    return { success: false, error: 'You do not need to discard' };
  }
  
  const totalToDiscard = Object.values(resources).reduce((a, b) => a + b, 0);
  if (totalToDiscard !== discardInfo.cardsToDiscard) {
    return { success: false, error: `Must discard exactly ${discardInfo.cardsToDiscard} cards` };
  }
  
  const player = game.players[playerIndex];
  
  // Verify player has these resources
  for (const [resource, amount] of Object.entries(resources)) {
    if (player.resources[resource] < amount) {
      return { success: false, error: `Not enough ${resource}` };
    }
  }
  
  // Discard
  for (const [resource, amount] of Object.entries(resources)) {
    player.resources[resource] -= amount;
  }
  
  // Remove from discarding list
  game.discardingPlayers = game.discardingPlayers.filter(d => d.playerIndex !== playerIndex);
  
  // If all done discarding, move to robber phase
  if (game.discardingPlayers.length === 0) {
    game.turnPhase = 'robber';
  }
  
  return { success: true };
}

/** 
 * Move the robber to a new hex and optionally steal from a player
 * 
 * IMPORTANT: After moving robber, the turn phase depends on hasRolledThisTurn:
 * - If Knight was played before rolling → return to 'roll' phase
 * - If 7 was rolled (hasRolledThisTurn=true) → proceed to 'main' phase
 */
export function moveRobber(game, playerId, hexKey, stealFromPlayerId) {
  const player = game.players[game.currentPlayerIndex];
  
  if (player.id !== playerId) {
    return { success: false, error: 'Not your turn' };
  }
  
  if (game.turnPhase !== 'robber') {
    return { success: false, error: 'Cannot move robber now' };
  }
  
  if (!game.hexes[hexKey]) {
    return { success: false, error: 'Invalid hex' };
  }
  
  if (hexKey === game.robber) {
    return { success: false, error: 'Must move robber to a different hex' };
  }
  
  game.robber = hexKey;
  
  let stolenInfo = null;
  
  // Steal from player if specified
  if (stealFromPlayerId) {
    const victimIndex = game.players.findIndex(p => p.id === stealFromPlayerId);
    if (victimIndex !== -1 && victimIndex !== game.currentPlayerIndex) {
      const victim = game.players[victimIndex];
      const availableResources = Object.entries(victim.resources)
        .filter(([_, amount]) => amount > 0)
        .map(([resource, _]) => resource);
      
      if (availableResources.length > 0) {
        const stolenResource = availableResources[Math.floor(Math.random() * availableResources.length)];
        victim.resources[stolenResource]--;
        player.resources[stolenResource]++;
        
        stolenInfo = {
          resource: stolenResource,
          thief: player.id,
          thiefName: player.name,
          victim: victim.id,
          victimName: victim.name
        };
      }
    }
  }
  
  // Return to appropriate phase based on whether dice have been rolled
  // This handles the case where Knight is played BEFORE rolling
  game.turnPhase = game.hasRolledThisTurn ? 'main' : 'roll';
  
  return { success: true, stolenInfo };
}

// ============================================================================
// BUILDING PLACEMENT
// ============================================================================

/** 
 * Validate settlement placement
 * Rules:
 * - Vertex must be unoccupied
 * - No adjacent buildings (distance rule)
 * - Must connect to own road (except during setup)
 * - Must have required resources (except during setup)
 */
export function canPlaceSettlement(game, playerId, vKey, isSetup = false) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { valid: false, error: 'Player not found' };
  
  const player = game.players[playerIndex];
  const vertex = game.vertices[vKey];
  
  if (!vertex) return { valid: false, error: 'Invalid vertex' };
  // Check if this vertex (or any equivalent) already has a building
  if (hasBuildingAtVertex(game, vKey)) return { valid: false, error: 'Location occupied' };
  if (player.settlements <= 0) return { valid: false, error: 'No settlements left' };
  
  // Check distance rule (no adjacent settlements) - use physical position check
  if (hasAdjacentBuilding(game, vKey)) {
    return { valid: false, error: 'Too close to another building' };
  }
  
  // During setup, no road connection needed
  if (!isSetup) {
    // Must be connected to own road (check all equivalent edge keys)
    const vertexEdges = getVertexEdges(vKey);
    const hasRoad = vertexEdges.some(eKey => hasPlayerRoadAtEdge(game, eKey, playerIndex));
    
    if (!hasRoad) {
      return { valid: false, error: 'Must be connected to your road' };
    }
    
    // Check resources
    if (!hasResources(player, BUILDING_COSTS.settlement)) {
      return { valid: false, error: 'Not enough resources' };
    }
  }
  
  return { valid: true };
}

/** Place a settlement on a valid vertex */
export function placeSettlement(game, playerId, vKey) {
  const isSetup = game.phase === 'setup';
  const validation = canPlaceSettlement(game, playerId, vKey, isSetup);
  
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  const player = game.players[playerIndex];
  
  // Deduct resources if not setup
  if (!isSetup) {
    deductResources(player, BUILDING_COSTS.settlement);
  }
  
  // Place settlement - stored at the key provided, lookups check all equivalents
  game.vertices[vKey] = { building: 'settlement', owner: playerIndex };
  player.settlements--;
  player.victoryPoints++;
  
  // During second setup phase, give initial resources
  if (isSetup && game.setupPhase === 1) {
    giveInitialResources(game, vKey, playerIndex);
  }
  
  checkWinner(game);
  
  return { success: true };
}

/** 
 * Give initial resources for second settlement during setup
 * Player receives one of each resource from adjacent hexes
 */
function giveInitialResources(game, vKey, playerIndex) {
  const match = vKey.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return;
  
  const q = parseInt(match[1]);
  const r = parseInt(match[2]);
  const player = game.players[playerIndex];
  
  // Get all hexes adjacent to this vertex
  const adjacentHexes = getAdjacentHexesToVertex(q, r, parseInt(match[3]));
  
  adjacentHexes.forEach(({ hq, hr }) => {
    const hex = game.hexes[hexKey(hq, hr)];
    if (hex && hex.resource) {
      player.resources[hex.resource]++;
    }
  });
}

/** 
 * Get the 3 hexes that share a vertex
 * Used for initial resource distribution during setup
 */
function getAdjacentHexesToVertex(q, r, dir) {
  const hexes = [{ hq: q, hr: r }];
  
  // POINTY-TOP: vertex 0=top, 1=upper-right, 2=lower-right, 3=bottom, 4=lower-left, 5=upper-left
  if (dir === 0) { // top vertex
    hexes.push({ hq: q, hr: r - 1 }); // hex above-left
    hexes.push({ hq: q + 1, hr: r - 1 }); // hex above-right
  } else if (dir === 1) { // upper-right vertex
    hexes.push({ hq: q + 1, hr: r - 1 }); // hex above-right
    hexes.push({ hq: q + 1, hr: r }); // hex right
  } else if (dir === 2) { // lower-right vertex
    hexes.push({ hq: q + 1, hr: r }); // hex right
    hexes.push({ hq: q, hr: r + 1 }); // hex below-right
  } else if (dir === 3) { // bottom vertex
    hexes.push({ hq: q, hr: r + 1 }); // hex below-right
    hexes.push({ hq: q - 1, hr: r + 1 }); // hex below-left
  } else if (dir === 4) { // lower-left vertex
    hexes.push({ hq: q - 1, hr: r + 1 }); // hex below-left
    hexes.push({ hq: q - 1, hr: r }); // hex left
  } else if (dir === 5) { // upper-left vertex
    hexes.push({ hq: q - 1, hr: r }); // hex left
    hexes.push({ hq: q, hr: r - 1 }); // hex above-left
  }
  
  return hexes;
}

/** 
 * Validate road placement
 * Rules:
 * - Edge must be unoccupied (checking all equivalent edge keys)
 * - Must connect to own road or building
 * - During setup: must connect to the just-placed settlement
 * - Must have required resources (except during setup or free roads)
 */
export function canPlaceRoad(game, playerId, eKey, isSetup = false, lastSettlement = null) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { valid: false, error: 'Player not found' };
  
  const player = game.players[playerIndex];
  const edge = game.edges[eKey];
  
  if (!edge) return { valid: false, error: 'Invalid edge' };
  
  // Check for existing road on this edge OR any equivalent edge
  // This prevents the same physical edge from having roads placed under different key formats
  if (hasRoadAtEdge(game, eKey)) return { valid: false, error: 'Road already exists' };
  if (player.roads <= 0) return { valid: false, error: 'No roads left' };
  
  // Parse edge key
  const match = eKey.match(/e_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return { valid: false, error: 'Invalid edge key' };
  
  const eq = parseInt(match[1]);
  const er = parseInt(match[2]);
  const edir = parseInt(match[3]);
  
  // Get vertices at ends of this edge
  const endVertices = getEdgeVertices(eq, er, edir);
  
  // Check connectivity
  let connected = false;
  
  if (isSetup && lastSettlement) {
    // Must connect to the last placed settlement
    // Use areVerticesEqual to handle equivalent vertex keys (same physical position, different hex reference)
    connected = endVertices.some(vKey => areVerticesEqual(vKey, lastSettlement));
  } else if (game.freeRoads > 0) {
    // Free road from road building card - must connect to own network
    connected = endVertices.some(vKey => {
      // Check if player has a building at this vertex or any equivalent vertex
      if (hasPlayerBuildingAtVertex(game, vKey, playerIndex)) return true;
      
      // Check if player has a road at any adjacent edge (checking all equivalent edges)
      const vEdges = getVertexEdges(vKey);
      return vEdges.some(ve => hasPlayerRoadAtEdge(game, ve, playerIndex));
    });
  } else {
    // Normal placement - must connect to own building or road
    connected = endVertices.some(vKey => {
      // Check if player has a building at this vertex or any equivalent vertex
      if (hasPlayerBuildingAtVertex(game, vKey, playerIndex)) return true;
      
      // Check if player has a road at any adjacent edge (checking all equivalent edges)
      // Exclude the edge being placed
      const vEdges = getVertexEdges(vKey);
      return vEdges.some(ve => {
        // Check if this is the same edge we're trying to place (need to check equivalents)
        const veMatch = ve.match(/e_(-?\d+)_(-?\d+)_(\d+)/);
        const eKeyMatch = eKey.match(/e_(-?\d+)_(-?\d+)_(\d+)/);
        if (veMatch && eKeyMatch) {
          const veEquivs = getEquivalentEdges(parseInt(veMatch[1]), parseInt(veMatch[2]), parseInt(veMatch[3]));
          const isCurrentEdge = veEquivs.some(eq => 
            eq.q === parseInt(eKeyMatch[1]) && eq.r === parseInt(eKeyMatch[2]) && eq.dir === parseInt(eKeyMatch[3])
          );
          if (isCurrentEdge) return false;
        }
        return hasPlayerRoadAtEdge(game, ve, playerIndex);
      });
    });
  }
  
  if (!connected) {
    return { valid: false, error: 'Must connect to your building or road' };
  }
  
  // Check resources (if not setup and not free road)
  if (!isSetup && game.freeRoads === 0) {
    if (!hasResources(player, BUILDING_COSTS.road)) {
      return { valid: false, error: 'Not enough resources' };
    }
  }
  
  return { valid: true };
}

/** 
 * Get the two vertices at the ends of an edge
 * Edge directions: 0=upper-right, 1=right, 2=lower-right, 3=lower-left, 4=left, 5=upper-left
 */
function getEdgeVertices(q, r, dir) {
  // Each edge connects two adjacent vertices
  if (dir === 0) return [vertexKey(q, r, 0), vertexKey(q, r, 1)]; // upper-right edge: top to upper-right
  if (dir === 1) return [vertexKey(q, r, 1), vertexKey(q, r, 2)]; // right edge: upper-right to lower-right
  if (dir === 2) return [vertexKey(q, r, 2), vertexKey(q, r, 3)]; // lower-right edge: lower-right to bottom
  if (dir === 3) return [vertexKey(q, r, 3), vertexKey(q, r, 4)]; // lower-left edge: bottom to lower-left
  if (dir === 4) return [vertexKey(q, r, 4), vertexKey(q, r, 5)]; // left edge: lower-left to upper-left
  if (dir === 5) return [vertexKey(q, r, 5), vertexKey(q, r, 0)]; // upper-left edge: upper-left to top
  return [];
}

/** Place a road on a valid edge */
export function placeRoad(game, playerId, eKey, isSetup = false, lastSettlement = null) {
  const validation = canPlaceRoad(game, playerId, eKey, isSetup, lastSettlement);
  
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  const player = game.players[playerIndex];
  
  // Deduct resources if not setup and not free road
  if (!isSetup && game.freeRoads === 0) {
    deductResources(player, BUILDING_COSTS.road);
  } else if (game.freeRoads > 0) {
    game.freeRoads--;
  }
  
  // Place road using the canonical edge key to ensure consistency
  // All lookups use hasRoadAtEdge which checks all equivalents, so this is safe
  game.edges[eKey] = { road: true, owner: playerIndex };
  player.roads--;
  
  // Update longest road
  updateLongestRoad(game);
  
  return { success: true };
}

/** Upgrade an existing settlement to a city (costs 3 ore + 2 grain) */
export function upgradeToCity(game, playerId, vKey) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found' };
  }
  
  // Allow building on regular turn or during special building phase
  if (!canPlayerBuildNow(game, playerId)) {
    return { success: false, error: 'Cannot build now' };
  }
  
  const player = game.players[playerIndex];
  const vertex = game.vertices[vKey];
  
  if (!vertex || vertex.building !== 'settlement' || vertex.owner !== playerIndex) {
    return { success: false, error: 'No settlement here to upgrade' };
  }
  
  if (player.cities <= 0) {
    return { success: false, error: 'No cities left' };
  }
  
  if (!hasResources(player, BUILDING_COSTS.city)) {
    return { success: false, error: 'Not enough resources' };
  }
  
  deductResources(player, BUILDING_COSTS.city);
  vertex.building = 'city';
  player.settlements++; // Return settlement
  player.cities--;
  player.victoryPoints++; // City worth 2 VP, settlement was 1, net +1
  
  checkWinner(game);
  
  return { success: true };
}

// ============================================================================
// DEVELOPMENT CARDS
// ============================================================================

/** 
 * Buy a development card (costs 1 ore + 1 grain + 1 wool)
 * Card is added to newDevCards - can't be played until next turn
 */
export function buyDevCard(game, playerId) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found' };
  }
  
  // Allow buying on regular turn or during special building phase
  if (!canPlayerBuildNow(game, playerId)) {
    return { success: false, error: 'Cannot buy now' };
  }
  
  const player = game.players[playerIndex];
  
  if (!hasResources(player, BUILDING_COSTS.developmentCard)) {
    return { success: false, error: 'Not enough resources' };
  }
  
  if (game.devCardDeck.length === 0) {
    return { success: false, error: 'No development cards left' };
  }
  
  deductResources(player, BUILDING_COSTS.developmentCard);
  const card = game.devCardDeck.pop();
  player.newDevCards.push(card);
  
  // Victory point cards are kept secret - track separately
  if (card === DEV_CARDS.VICTORY_POINT) {
    player.hiddenVictoryPoints = (player.hiddenVictoryPoints || 0) + 1;
    checkWinner(game);
  }
  
  return { success: true, card };
}

/** 
 * Play a development card
 * Rules:
 * - Can only play one dev card per turn
 * - Can't play cards bought this turn
 * - VP cards are never "played" (just count toward victory)
 */
export function playDevCard(game, playerId, cardType, params = {}) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found' };
  }
  
  if (game.currentPlayerIndex !== playerIndex) {
    return { success: false, error: 'Not your turn' };
  }
  
  // Can only play one dev card per turn
  if (game.devCardPlayedThisTurn) {
    return { success: false, error: 'You can only play one development card per turn' };
  }
  
  const player = game.players[playerIndex];
  
  // Can't play cards bought this turn (except VP which is auto-played)
  const cardIndex = player.developmentCards.indexOf(cardType);
  if (cardIndex === -1) {
    return { success: false, error: 'You do not have this card' };
  }
  
  // Remove card
  player.developmentCards.splice(cardIndex, 1);
  
  switch (cardType) {
    case DEV_CARDS.KNIGHT:
      player.knightsPlayed++;
      game.turnPhase = 'robber';
      updateLargestArmy(game);
      break;
      
    case DEV_CARDS.ROAD_BUILDING:
      game.freeRoads = Math.min(2, player.roads);
      break;
      
    case DEV_CARDS.YEAR_OF_PLENTY:
      game.yearOfPlentyPicks = 2;
      break;
      
    case DEV_CARDS.MONOPOLY:
      if (!params.resource) {
        return { success: false, error: 'Must specify a resource' };
      }
      // Take all of that resource from other players
      let totalStolen = 0;
      game.players.forEach((p, idx) => {
        if (idx !== playerIndex) {
          totalStolen += p.resources[params.resource];
          p.resources[params.resource] = 0;
        }
      });
      player.resources[params.resource] += totalStolen;
      break;
      
    case DEV_CARDS.VICTORY_POINT:
      return { success: false, error: 'Victory point cards cannot be played' };
  }
  
  // Mark that a dev card was played this turn
  game.devCardPlayedThisTurn = true;
  
  return { success: true };
}

/** Year of Plenty card effect - pick 2 free resources from the bank */
export function yearOfPlentyPick(game, playerId, resource) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found' };
  }
  
  if (game.currentPlayerIndex !== playerIndex) {
    return { success: false, error: 'Not your turn' };
  }
  
  if (game.yearOfPlentyPicks <= 0) {
    return { success: false, error: 'No year of plenty picks remaining' };
  }
  
  const player = game.players[playerIndex];
  player.resources[resource]++;
  game.yearOfPlentyPicks--;
  
  return { success: true };
}

// ============================================================================
// TRADING
// ============================================================================

/** Get all ports accessible to a player (based on their settlements/cities) */
export function getPlayerPorts(game, playerIndex) {
  const playerPorts = [];
  
  game.ports?.forEach(port => {
    // Check if player has a building at any of the port's vertices
    const hasAccess = port.vertices.some(vKey => {
      // Check all equivalent vertices
      const match = vKey.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
      if (!match) return false;
      
      const q = parseInt(match[1]), r = parseInt(match[2]), dir = parseInt(match[3]);
      const equivalents = getEquivalentVertices(q, r, dir);
      
      return equivalents.some(eq => {
        const eqKey = vertexKey(eq.q, eq.r, eq.dir);
        const vertex = game.vertices[eqKey];
        return vertex?.building && vertex?.owner === playerIndex;
      });
    });
    
    if (hasAccess) {
      playerPorts.push(port);
    }
  });
  
  return playerPorts;
}

/** 
 * Get the best trade ratio for a player and a specific resource
 * Priority: 2:1 specific port > 3:1 generic port > 4:1 default
 */
export function getTradeRatio(game, playerIndex, resource) {
  const ports = getPlayerPorts(game, playerIndex);
  
  // Check for specific resource 2:1 port
  const specificPort = ports.find(p => p.resource === resource);
  if (specificPort) return 2;
  
  // Check for generic 3:1 port
  const genericPort = ports.find(p => p.resource === null);
  if (genericPort) return 3;
  
  // Default 4:1 ratio
  return 4;
}

/** Execute a trade with the bank using port ratios */
export function bankTrade(game, playerId, giveResource, giveAmount, getResource) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found' };
  }
  
  if (game.currentPlayerIndex !== playerIndex) {
    return { success: false, error: 'Not your turn' };
  }
  
  if (game.turnPhase !== 'main') {
    return { success: false, error: 'Cannot trade now' };
  }
  
  const player = game.players[playerIndex];
  
  // Get the best available trade ratio for this resource
  const requiredRatio = getTradeRatio(game, playerIndex, giveResource);
  
  if (giveAmount !== requiredRatio) {
    return { success: false, error: `Trade requires ${requiredRatio}:1 ratio for ${giveResource}` };
  }
  
  if (player.resources[giveResource] < giveAmount) {
    return { success: false, error: 'Not enough resources' };
  }
  
  player.resources[giveResource] -= giveAmount;
  player.resources[getResource] += 1;
  
  return { success: true };
}

/** Propose a trade offer to other players */
export function proposeTrade(game, playerId, offer, request) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found' };
  }
  
  if (game.currentPlayerIndex !== playerIndex) {
    return { success: false, error: 'Not your turn' };
  }
  
  if (game.turnPhase !== 'main') {
    return { success: false, error: 'Cannot trade now' };
  }
  
  const player = game.players[playerIndex];
  
  // Verify player has offered resources
  for (const [resource, amount] of Object.entries(offer)) {
    if (player.resources[resource] < amount) {
      return { success: false, error: `Not enough ${resource}` };
    }
  }
  
  game.tradeOffer = {
    from: playerIndex,
    offer,
    request,
    responses: {} // playerId -> 'accept' | 'decline'
  };
  
  return { success: true };
}

/** Respond to a trade offer (accept or decline) */
export function respondToTrade(game, playerId, accept) {
  if (!game.tradeOffer) {
    return { success: false, error: 'No trade offer' };
  }
  
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found' };
  }
  
  if (playerIndex === game.tradeOffer.from) {
    return { success: false, error: 'Cannot respond to your own trade' };
  }
  
  const player = game.players[playerIndex];
  
  if (accept) {
    // Verify player has requested resources
    for (const [resource, amount] of Object.entries(game.tradeOffer.request)) {
      if (player.resources[resource] < amount) {
        return { success: false, error: `Not enough ${resource}` };
      }
    }
    
    // Execute trade
    const offerer = game.players[game.tradeOffer.from];
    
    for (const [resource, amount] of Object.entries(game.tradeOffer.offer)) {
      offerer.resources[resource] -= amount;
      player.resources[resource] += amount;
    }
    
    for (const [resource, amount] of Object.entries(game.tradeOffer.request)) {
      player.resources[resource] -= amount;
      offerer.resources[resource] += amount;
    }
    
    game.tradeOffer = null;
    return { success: true, traded: true };
  } else {
    game.tradeOffer.responses[playerId] = 'decline';
    
    // Check if all players declined
    const otherPlayers = game.players.filter((_, i) => i !== game.tradeOffer.from);
    const allDeclined = otherPlayers.every(p => game.tradeOffer.responses[p.id] === 'decline');
    
    if (allDeclined) {
      game.tradeOffer = null;
    }
    
    return { success: true, traded: false };
  }
}

/** Cancel an active trade offer */
export function cancelTrade(game, playerId) {
  if (!game.tradeOffer) {
    return { success: false, error: 'No trade offer' };
  }
  
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex !== game.tradeOffer.from) {
    return { success: false, error: 'Only the offerer can cancel' };
  }
  
  game.tradeOffer = null;
  return { success: true };
}

// ============================================================================
// TURN MANAGEMENT
// ============================================================================

/** 
 * End the current player's turn
 * - Moves new dev cards to playable cards
 * - Resets turn-based flags
 * - In 5-6 player games: initiates Special Building Phase
 * - Advances to next player
 */
export function endTurn(game, playerId) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  
  if (game.currentPlayerIndex !== playerIndex) {
    return { success: false, error: 'Not your turn' };
  }
  
  if (game.phase === 'setup') {
    return { success: false, error: 'Complete setup first' };
  }
  
  if (game.turnPhase !== 'main') {
    return { success: false, error: 'Cannot end turn now' };
  }
  
  // Move new dev cards to regular cards
  const player = game.players[playerIndex];
  player.developmentCards.push(...player.newDevCards);
  player.newDevCards = [];
  
  // Cancel any pending trade and reset turn-based flags
  game.tradeOffer = null;
  game.freeRoads = 0;
  game.yearOfPlentyPicks = 0;
  game.devCardPlayedThisTurn = false;
  game.hasRolledThisTurn = false;
  
  // In 5-6 player games, start Special Building Phase (if enabled)
  if (game.isExtended && game.players.length > 4 && game.enableSpecialBuild) {
    game.specialBuildingPhase = true;
    // Start with the player after the current player
    game.specialBuildIndex = (playerIndex + 1) % game.players.length;
    // Skip the current player (they just ended their turn)
    if (game.specialBuildIndex === playerIndex) {
      game.specialBuildIndex = (game.specialBuildIndex + 1) % game.players.length;
    }
    game.turnPhase = 'specialBuild';
    return { success: true, specialBuildingPhase: true };
  }
  
  // Next player
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  game.turnPhase = 'roll';
  game.diceRoll = null;
  
  return { success: true };
}

/** 
 * End special building phase for a player (5-6 player extension)
 * Advances to next player or ends the phase if all players have gone
 */
export function endSpecialBuild(game, playerId) {
  if (!game.specialBuildingPhase) {
    return { success: false, error: 'Not in special building phase' };
  }
  
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  
  if (game.specialBuildIndex !== playerIndex) {
    return { success: false, error: 'Not your turn to special build' };
  }
  
  // Move to next player in special building phase
  const currentTurnPlayer = game.currentPlayerIndex;
  let nextIndex = (playerIndex + 1) % game.players.length;
  
  // Check if we've gone around to the original player
  if (nextIndex === currentTurnPlayer) {
    // Special building phase is over, move to next turn
    game.specialBuildingPhase = false;
    game.specialBuildIndex = 0;
    game.currentPlayerIndex = (currentTurnPlayer + 1) % game.players.length;
    game.turnPhase = 'roll';
    game.diceRoll = null;
    game.hasRolledThisTurn = false;
    return { success: true, specialBuildingPhaseEnded: true };
  }
  
  game.specialBuildIndex = nextIndex;
  return { success: true };
}

/** Check if a player can currently act in the special building phase */
export function canSpecialBuild(game, playerId) {
  if (!game.specialBuildingPhase) return false;
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  return game.specialBuildIndex === playerIndex;
}

/** Check if a player can currently build (regular turn or special building phase) */
function canPlayerBuildNow(game, playerId) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return false;
  
  // Regular turn building
  if (game.currentPlayerIndex === playerIndex && game.turnPhase === 'main') {
    return true;
  }
  
  // Special building phase
  if (game.specialBuildingPhase && game.specialBuildIndex === playerIndex) {
    return true;
  }
  
  return false;
}

/** 
 * Advance the setup phase after a player places their settlement + road
 * Setup follows snake order: 1→2→3→4→4→3→2→1 for 4 players
 */
export function advanceSetup(game, playerId) {
  const player = game.players[game.currentPlayerIndex];
  
  if (player.id !== playerId) {
    return { success: false, error: 'Not your turn' };
  }
  
  if (game.phase !== 'setup') {
    return { success: false, error: 'Not in setup phase' };
  }
  
  const numPlayers = game.players.length;
  
  if (game.setupPhase === 0) {
    // First round - go forward
    if (game.currentPlayerIndex < numPlayers - 1) {
      game.currentPlayerIndex++;
    } else {
      // Start second round (same player goes again)
      game.setupPhase = 1;
    }
  } else {
    // Second round - go backward
    if (game.currentPlayerIndex > 0) {
      game.currentPlayerIndex--;
    } else {
      // Setup complete
      game.phase = 'playing';
      game.turnPhase = 'roll';
    }
  }
  
  return { success: true };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Check if a player has enough resources for a given cost */
function hasResources(player, costs) {
  for (const [resource, amount] of Object.entries(costs)) {
    if (player.resources[resource] < amount) {
      return false;
    }
  }
  return true;
}

/** Deduct resources from a player */
function deductResources(player, costs) {
  for (const [resource, amount] of Object.entries(costs)) {
    player.resources[resource] -= amount;
  }
}

// ============================================================================
// LONGEST ROAD CALCULATION
// ============================================================================

/** 
 * Calculate a player's longest continuous road using Depth-First Search
 * 
 * Key rules:
 * - Roads must be connected to count
 * - Opponent settlements break road continuity at that vertex
 * - Own settlements do NOT break continuity
 * - Can traverse circular paths but each road segment only counts once per path
 * 
 * @returns The length of the longest continuous road for this player
 */
function calculateRoadLength(game, playerIndex) {
  const playerEdges = Object.entries(game.edges)
    .filter(([_, edge]) => edge.road && edge.owner === playerIndex)
    .map(([key, _]) => key);
  
  if (playerEdges.length === 0) return 0;
  
  let maxLength = 0;
  const visited = new Set();
  
  // Helper to get canonical edge key for visited tracking
  function getCanonicalEdgeKey(eKey) {
    const match = eKey.match(/e_(-?\d+)_(-?\d+)_(\d+)/);
    if (!match) return eKey;
    const equivs = getEquivalentEdges(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
    // Use the edge key with smallest coordinates as canonical
    equivs.sort((a, b) => a.q - b.q || a.r - b.r || a.dir - b.dir);
    return edgeKey(equivs[0].q, equivs[0].r, equivs[0].dir);
  }
  
  function dfs(edgeKey, length) {
    const canonical = getCanonicalEdgeKey(edgeKey);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    maxLength = Math.max(maxLength, length);
    
    // Get vertices of this edge
    const match = edgeKey.match(/e_(-?\d+)_(-?\d+)_(\d+)/);
    if (!match) return;
    
    const vertices = getEdgeVertices(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
    
    for (const vKey of vertices) {
      // Check if opponent has a settlement here (breaks road) - check all equivalent vertices
      if (hasOpponentBuildingAtVertex(game, vKey, playerIndex)) continue;
      
      // Get adjacent edges and check for player's roads (checking all equivalents)
      const adjEdges = getVertexEdges(vKey);
      for (const adjEdge of adjEdges) {
        const adjCanonical = getCanonicalEdgeKey(adjEdge);
        if (!visited.has(adjCanonical) && hasPlayerRoadAtEdge(game, adjEdge, playerIndex)) {
          dfs(adjEdge, length + 1);
        }
      }
    }
    
    visited.delete(canonical);
  }
  
  for (const startEdge of playerEdges) {
    dfs(startEdge, 1);
  }
  
  return maxLength;
}

/** Check if an opponent has a building at a vertex (breaks road continuity) */
function hasOpponentBuildingAtVertex(game, vKey, playerIndex) {
  const match = vKey.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return false;
  
  const q = parseInt(match[1]), r = parseInt(match[2]), dir = parseInt(match[3]);
  const equivalents = getEquivalentVertices(q, r, dir);
  
  for (const eq of equivalents) {
    const eqKey = vertexKey(eq.q, eq.r, eq.dir);
    const vertex = game.vertices[eqKey];
    if (vertex?.building && vertex.owner !== playerIndex) {
      return true;
    }
  }
  return false;
}

/** 
 * Update the Longest Road holder after any road placement
 * 
 * Rules:
 * - Need at least 5 roads to claim Longest Road
 * - Current holder keeps it on ties
 * - If current holder loses longest and there's a tie, nobody gets it
 * - Worth 2 Victory Points
 */
export function updateLongestRoad(game) {
  // Calculate road lengths for all players
  const roadLengths = game.players.map((player, idx) => {
    const length = calculateRoadLength(game, idx);
    player.roadLength = length;
    return { playerIndex: idx, length };
  });
  
  // Find the maximum road length among all players
  const maxLength = Math.max(...roadLengths.map(r => r.length));
  
  // Must have at least 5 roads to claim longest road
  if (maxLength < 5) {
    // If current holder's road dropped below 5, they lose it
    if (game.longestRoadPlayer !== null) {
      game.players[game.longestRoadPlayer].hasLongestRoad = false;
      game.players[game.longestRoadPlayer].victoryPoints -= 2;
      game.longestRoadPlayer = null;
      game.longestRoadLength = 4;
      checkWinner(game);
    }
    return;
  }
  
  // Find all players with the maximum length
  const playersWithMax = roadLengths.filter(r => r.length === maxLength);
  
  // Current holder's road length
  const currentHolderLength = game.longestRoadPlayer !== null 
    ? game.players[game.longestRoadPlayer].roadLength 
    : 0;
  
  // Check if current holder still has the max length (they keep it on ties)
  const currentHolderHasMax = game.longestRoadPlayer !== null && 
    game.players[game.longestRoadPlayer].roadLength === maxLength;
  
  if (currentHolderHasMax) {
    // Current holder keeps it, but update the stored length
    game.longestRoadLength = maxLength;
    return;
  }
  
  // If there's a tie and no current holder has max, check if only one player has max
  if (playersWithMax.length === 1) {
    const newHolder = playersWithMax[0].playerIndex;
    
    // New player takes longest road
    if (game.longestRoadPlayer !== null) {
      game.players[game.longestRoadPlayer].hasLongestRoad = false;
      game.players[game.longestRoadPlayer].victoryPoints -= 2;
    }
    
    game.longestRoadPlayer = newHolder;
    game.longestRoadLength = maxLength;
    game.players[newHolder].hasLongestRoad = true;
    game.players[newHolder].victoryPoints += 2;
    
    checkWinner(game);
  } else if (playersWithMax.length > 1 && game.longestRoadPlayer !== null && 
             !currentHolderHasMax) {
    // Tie between multiple players and current holder is NOT one of them
    // Current holder loses it, but no one gets it (disputed)
    game.players[game.longestRoadPlayer].hasLongestRoad = false;
    game.players[game.longestRoadPlayer].victoryPoints -= 2;
    game.longestRoadPlayer = null;
    game.longestRoadLength = maxLength; // Keep tracking the max for future reference
    
    checkWinner(game);
  }
  // If tie and no current holder, no one gets it (stays null)
}

// ============================================================================
// LARGEST ARMY CALCULATION
// ============================================================================

/** 
 * Update the Largest Army holder after playing a Knight
 * 
 * Rules:
 * - Need at least 3 knights to claim Largest Army
 * - Current holder keeps it on ties
 * - Worth 2 Victory Points
 */
function updateLargestArmy(game) {
  // Find the maximum knights played among all players
  const maxKnights = Math.max(...game.players.map(p => p.knightsPlayed));
  
  // Must have at least 3 knights to claim largest army
  if (maxKnights < 3) {
    return;
  }
  
  // Find all players with the maximum knights
  const playersWithMax = game.players
    .map((p, idx) => ({ playerIndex: idx, knights: p.knightsPlayed }))
    .filter(p => p.knights === maxKnights);
  
  // Check if current holder still has the max (they keep it on ties)
  const currentHolderHasMax = game.largestArmyPlayer !== null && 
    game.players[game.largestArmyPlayer].knightsPlayed === maxKnights;
  
  if (currentHolderHasMax) {
    // Current holder keeps it, but update the stored size
    game.largestArmySize = maxKnights;
    return;
  }
  
  // If only one player has max, they get it
  if (playersWithMax.length === 1) {
    const newHolder = playersWithMax[0].playerIndex;
    
    // New player takes largest army
    if (game.largestArmyPlayer !== null) {
      game.players[game.largestArmyPlayer].hasLargestArmy = false;
      game.players[game.largestArmyPlayer].victoryPoints -= 2;
    }
    
    game.largestArmyPlayer = newHolder;
    game.largestArmySize = maxKnights;
    game.players[newHolder].hasLargestArmy = true;
    game.players[newHolder].victoryPoints += 2;
    
    checkWinner(game);
  } else if (playersWithMax.length > 1 && game.largestArmyPlayer !== null && 
             !currentHolderHasMax) {
    // Tie between multiple players and current holder is NOT one of them
    // Current holder loses it, but no one gets it (disputed)
    game.players[game.largestArmyPlayer].hasLargestArmy = false;
    game.players[game.largestArmyPlayer].victoryPoints -= 2;
    game.largestArmyPlayer = null;
    game.largestArmySize = maxKnights;
    
    checkWinner(game);
  }
  // If tie and no current holder, no one gets it (stays null)
}

// ============================================================================
// VICTORY CONDITION
// ============================================================================

/** 
 * Check if any player has won (10+ victory points)
 * When game ends, reveals all hidden VP cards and updates final scores
 */
function checkWinner(game) {
  for (const player of game.players) {
    // Total VP = visible VP + hidden VP from dev cards
    const totalVP = player.victoryPoints + (player.hiddenVictoryPoints || 0);
    if (totalVP >= 10) {
      game.phase = 'finished';
      game.winner = player.id;
      
      // Reveal ALL players' hidden VPs when game ends (so everyone can see final scores)
      for (const p of game.players) {
        const pTotalVP = p.victoryPoints + (p.hiddenVictoryPoints || 0);
        p.victoryPoints = pTotalVP;
        p.hiddenVictoryPoints = 0;
      }
      return;
    }
  }
}

// ============================================================================
// PLAYER VIEW (for sending game state to clients)
// ============================================================================

/** 
 * Get a player-specific view of the game state
 * 
 * Hides private information from other players:
 * - Other players' development cards (shows count only)
 * - Other players' specific resources (shows total count only)
 * - Other players' hidden VP cards
 * 
 * After game ends, all information becomes public.
 */
export function getPlayerView(game, playerId) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  
  // Get trade ratios for this player
  const tradeRatios = {
    brick: getTradeRatio(game, playerIndex, 'brick'),
    lumber: getTradeRatio(game, playerIndex, 'lumber'),
    wool: getTradeRatio(game, playerIndex, 'wool'),
    grain: getTradeRatio(game, playerIndex, 'grain'),
    ore: getTradeRatio(game, playerIndex, 'ore')
  };
  
  // After game ends, all information is public
  const isGameOver = game.phase === 'finished';
  
  return {
    ...game,
    players: game.players.map((p, idx) => ({
      ...p,
      // After game over, show everyone's dev cards; during game, only show own cards
      developmentCards: isGameOver || idx === playerIndex ? p.developmentCards : p.developmentCards.length,
      newDevCards: isGameOver || idx === playerIndex ? p.newDevCards : p.newDevCards.length,
      // After game over, show everyone's resources; during game, only show own resources
      resources: isGameOver || idx === playerIndex ? p.resources : Object.values(p.resources).reduce((a, b) => a + b, 0),
      // After game over, show everyone's hidden VP; during game, only show own
      // (Note: hidden VPs should already be moved to victoryPoints when game ends, 
      // but this is a safety check)
      hiddenVictoryPoints: isGameOver || idx === playerIndex ? p.hiddenVictoryPoints : 0
    })),
    devCardDeck: game.devCardDeck.length,
    myIndex: playerIndex,
    myPorts: getPlayerPorts(game, playerIndex),
    tradeRatios,
    hasRolledThisTurn: game.hasRolledThisTurn
  };
}

// ============================================================================
// PUBLIC UTILITY FUNCTIONS
// ============================================================================

/** Get hexes adjacent to a vertex (for resource distribution display) */
export function getVertexAdjacentHexes(game, vKey) {
  const match = vKey.match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  if (!match) return [];
  
  const q = parseInt(match[1]);
  const r = parseInt(match[2]);
  const dir = parseInt(match[3]);
  
  const adjHexCoords = getAdjacentHexesToVertex(q, r, dir);
  return adjHexCoords
    .map(({ hq, hr }) => game.hexes[hexKey(hq, hr)])
    .filter(h => h);
}

/** Get players with buildings adjacent to a hex (for robber stealing) */
export function getPlayersOnHex(game, hKey, excludePlayer = null) {
  const hex = game.hexes[hKey];
  if (!hex) return [];
  
  const players = new Set();
  
  for (let dir = 0; dir < 6; dir++) {
    // Use findBuildingAtHexVertex to check all equivalent vertex keys
    const building = findBuildingAtHexVertex(game, hex.q, hex.r, dir);
    if (building && building.owner !== excludePlayer) {
      players.add(building.owner);
    }
  }
  
  return Array.from(players);
}

