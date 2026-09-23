/* eslint-disable @typescript-eslint/no-require-imports -- Node preload must remain CommonJS on Windows. */
// Some restricted Windows runtimes cannot resolve the current account through libuv.
const os = require('node:os');
const original = os.userInfo;
os.userInfo = function(options) { try { return original(options); } catch (error) { if (process.platform !== 'win32') throw error; return { username: process.env.USERNAME || 'sites-local', uid: -1, gid: -1, shell: null, homedir: os.homedir() }; } };
