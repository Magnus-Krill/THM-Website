'use strict';

const { publicHighwayLoopProgress } = require('../../kitbot/helpers/highwayGeometry.cjs');

const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const axisNames = new Set(directions.flatMap(name => [name, 'dug' + name]));

function publicNetherMap({ nether = {} }, segments = []) {
  function coordinates(entry) {
    const { x, z } = entry?.coordinates ?? {};
    if (Number.isSafeInteger(x) && Number.isSafeInteger(z)) return [x, z];
  }

  const axes = [];
  for (const name of directions) {
    const road = nether[name];
    const paved = road?.onMap === true && coordinates(road);
    if (!paved) continue;
    const extension = nether['dug' + name];
    const dug = extension?.onMap === true && coordinates(extension);
    axes.push([name, ...paved, ...(dug || [])]);
  }

  function loops(roads) {
    return (roads ?? []).filter(road => road?.onMap !== false && Number.isSafeInteger(road?.radius) && road.radius > 0)
      .map(({ radius, paved }) => [radius, paved === true ? 1 : 0]);
  }

  const points = [];
  for (const [name, entry] of Object.entries(nether)) {
    if (axisNames.has(name) || entry?.onMap !== true) continue;
    const point = coordinates(entry);
    if (point) points.push([name, ...point]);
  }

  const progress = publicHighwayLoopProgress(nether, segments);
  return { axes, rings: loops(nether.ringRoads), diamonds: loops(nether.diamondHighways), points, ...(progress.length ? { progress } : {}) };
}

module.exports = { publicNetherMap };
