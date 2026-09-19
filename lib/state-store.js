'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {validState} = require('../renderer/core');

function atomicWrite(file, text, io = fs) {
  const temporary = file + '.tmp';
  let fd;
  try {
    fd = io.openSync(temporary, 'w', 0o600);
    io.writeFileSync(fd, text, 'utf8');
    io.fsyncSync(fd);
    io.closeSync(fd); fd = undefined;
    io.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) io.closeSync(fd);
    try { io.unlinkSync(temporary); } catch (_) {}
  }
}
function createStateStore(file, io = fs) {
  function read(candidate) {
    try {
      const value = JSON.parse(io.readFileSync(candidate, 'utf8'));
      return validState(value) ? value : null;
    } catch (_) { return null; }
  }
  return {
    load() { return read(file) || read(file + '.bak'); },
    save(state) {
      if (!validState(state)) throw new TypeError('Invalid application state');
      io.mkdirSync(path.dirname(file), {recursive: true});
      const previous = read(file);
      // Never overwrite the last valid backup with a corrupt primary file.
      if (previous) atomicWrite(file + '.bak', JSON.stringify(previous, null, 2), io);
      atomicWrite(file, JSON.stringify(state, null, 2), io);
    },
  };
}
module.exports = {atomicWrite, createStateStore};
