'use strict';
function clampWindowX(x, workArea, preferredWidth = 1060) {
  const width = Math.max(1, Math.min(preferredWidth, workArea.width));
  return Math.max(workArea.x, Math.min(Math.round(x), workArea.x + workArea.width - width));
}
function panelBounds(workArea, requestedHeight, preferredWidth = 1060, preferredX = null) {
  const width = Math.max(1, Math.min(preferredWidth, workArea.width));
  const height = Math.max(1, Math.min(requestedHeight, workArea.height));
  const x = Number.isFinite(preferredX) ? clampWindowX(preferredX, workArea, preferredWidth) : Math.round(workArea.x + (workArea.width - width) / 2);
  return {x, y: workArea.y, width, height};
}
function inHoverZone(point, display) {
  const bounds = display.bounds;
  const halfWidth = Math.min(220, bounds.width / 2);
  return Math.abs(point.x - (bounds.x + bounds.width / 2)) <= halfWidth &&
    point.y >= bounds.y && point.y < bounds.y + 4;
}
function hoverRevealEnabled(state) {
  return state?.settings?.revealOnHover === true;
}
module.exports = {panelBounds, inHoverZone, hoverRevealEnabled, clampWindowX};
