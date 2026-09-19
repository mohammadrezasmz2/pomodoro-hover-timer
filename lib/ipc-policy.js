'use strict';
const {validState} = require('../renderer/core');
function trustedSender(event, window, pageURL) {
  try {
    return !!window && !window.isDestroyed() && event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === pageURL;
  } catch (_) { return false; }
}
function validPayload(state) {
  if (!validState(state)) return false;
  try { return Buffer.byteLength(JSON.stringify(state), 'utf8') <= 16 * 1024 * 1024; }
  catch (_) { return false; }
}
module.exports = {trustedSender, validPayload};
