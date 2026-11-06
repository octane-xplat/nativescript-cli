'use strict';
const fail = code => Object.assign(new Error(), { code });
module.exports = async function bundle(p, emit) {
  if (['native','native-bundle'].includes(p.mode)) return require('./native.cjs')(p, emit);
  throw fail('invalid_input');
};
