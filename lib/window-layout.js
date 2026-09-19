'use strict';
function panelBounds(workArea, requestedHeight, preferredWidth = 1060) {
  const width = Math.max(1, Math.min(preferredWidth, workArea.width));
  const height = Math.max(1, Math.min(requestedHeight, workArea.height));
  return {x: Math.round(workArea.x + (workArea.width - width) / 2), y: workArea.y, width, height};
}
function inHoverZone(point, display) {
  const bounds = display.bounds;
  const halfWidth = Math.min(220, bounds.width / 2);
  return Math.abs(point.x - (bounds.x + bounds.width / 2)) <= halfWidth &&
    point.y >= bounds.y && point.y < bounds.y + 4;
}
module.exports = {panelBounds, inHoverZone};
