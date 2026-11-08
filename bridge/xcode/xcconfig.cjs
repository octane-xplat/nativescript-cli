'use strict';
// Faithful port of Xcodeproj::Config plus the NativeScript CLI's
// XcconfigService.mergeFiles contract (services/xcconfig-service.js): a source
// xcconfig merges into a destination where the destination's kept values win,
// except a kept value containing $(inherited), which absorbs the source's
// non-inherited remainder. OTHER_LDFLAGS travels through CocoaPods' linker
// flag sets so libraries/frameworks deduplicate and serialize sorted. Source
// file #include lines are dropped exactly like upstream's merge, which never
// consults a source config's includes when appending attributes.
const inheritedPattern = /\$\(inherited\)|\$\{inherited\}/g;
const shellsplit = value => (value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map(token => token.replace(/["']/g, ''));
const flagSets = () => ({ simple: new Set(), libraries: new Set(), frameworks: new Set(), weak_frameworks: new Set(), arg_files: new Set(), force_load: new Set() });
// OtherLinkerFlagsParser.split: shell words first, then a fused -l<lib> or
// @<file> token splits into its switch and operand.
function mergeFlags(flags, value) {
  let key = null;
  for (const token of shellsplit(value).flatMap(t => /^-l.+/.test(t) ? ['-l', t.slice(2)] : /^@.+/.test(t) ? ['@', t.slice(1)] : [t])) {
    if (token === '-framework') key = 'frameworks';
    else if (token === '-weak_framework') key = 'weak_frameworks';
    else if (token === '-l') key = 'libraries';
    else if (token === '@') key = 'arg_files';
    else if (token === '-force_load') key = 'force_load';
    else if (key) { flags[key].add(token); key = null; }
    else flags.simple.add(token);
  }
}
// Xcodeproj::Config.new(file): comment-stripped lines, $(inherited) resolves
// to the same key's earlier value, and OTHER_LDFLAGS moves into flag sets.
function parse(text) {
  const raw = new Map();
  for (const line of text.split('\n')) {
    const uncommented = line.split('//')[0];
    if (/#include\??\s*"(.+)"/.test(uncommented)) continue;
    const assignment = /([^=\[]+(?:\[[^\]]*?(?:=[^\]]*?)?\])*)\s*=(.*)/.exec(uncommented);
    if (!assignment) continue;
    const key = assignment[1].trim();
    raw.set(key, assignment[2].trim().replace(inheritedPattern, marker => raw.has(key) ? raw.get(key) : marker));
  }
  const attributes = new Map(raw), flags = flagSets();
  if (attributes.has('OTHER_LDFLAGS')) { mergeFlags(flags, attributes.get('OTHER_LDFLAGS')); attributes.delete('OTHER_LDFLAGS'); }
  return { attributes, flags };
}
const sorted = set => [...set].sort();
const flagValue = flags => [
  ...sorted(flags.simple),
  ...sorted(flags.libraries).map(x => `-l"${x}"`),
  ...sorted(flags.frameworks).map(x => `-framework "${x}"`),
  ...sorted(flags.weak_frameworks).map(x => `-weak_framework "${x}"`),
  ...sorted(flags.arg_files).map(x => `@"${x}"`),
  ...sorted(flags.force_load).map(x => `-force_load ${x}`),
].join(' ');
// Config#to_hash: rebuilt linker flags first, then values that are only
// $(inherited) disappear (Ruby rejects them before serialization).
function toHash({ attributes, flags }) {
  const out = new Map(attributes);
  const ldflags = flagValue(flags);
  if (ldflags) out.set('OTHER_LDFLAGS', ldflags);
  for (const [key, value] of [...out]) if (typeof value !== 'string' || /^\$\(inherited\)$|^\$\{inherited\}$/.test(value.trim())) out.delete(key);
  return out;
}
// Config#merge_attributes!: append wins only when neither value already
// contains the other's shell words.
function mergeAttributes(attributes, incoming) {
  for (const [key, v2] of incoming) {
    const kept = attributes.get(key);
    if (kept === undefined) { attributes.set(key, v2); continue; }
    const v1 = kept.trim(), source = v2.trim();
    const s1 = shellsplit(v1), s2 = shellsplit(source);
    attributes.set(key,
      s2.every(t => s1.includes(t)) || s1.slice(0, s2.length).join(' ') === s2.join(' ') ? v1
        : s2.slice(0, s1.length).join(' ') === s1.join(' ') ? source
          : `${v1} ${source}`);
  }
}
// XcconfigService.mergeFiles(source -> destination): destination-kept values
// win; a kept $(inherited) value absorbs the source remainder; remaining
// source attributes append through merge_attributes!; flag sets union.
exports.mergeFiles = (source, destination) => {
  const user = parse(destination), existing = parse(source);
  const conflicts = [];
  for (const [key, kept] of user.attributes) {
    if (!existing.attributes.has(key)) continue;
    const incoming = existing.attributes.get(key);
    if (/\$\(inherited\)|\$\{inherited\}/.test(kept)) {
      const appended = incoming.replace(inheritedPattern, '').trim();
      if (appended) existing.attributes.set(key, appended); else existing.attributes.delete(key);
    } else {
      if (incoming !== kept) conflicts.push({ key, kept, ignored: incoming });
      existing.attributes.delete(key);
    }
  }
  // userConfig.merge(existingConfig): dup rewrites through to_hash (dropping
  // pure-inherited rows) and merge! appends attributes plus unions flag sets.
  const merged = { attributes: new Map(), flags: flagSets() };
  const kept = toHash({ attributes: user.attributes, flags: user.flags });
  kept.delete('OTHER_LDFLAGS');
  merged.attributes = kept;
  for (const name of Object.keys(merged.flags)) for (const token of user.flags[name]) merged.flags[name].add(token);
  mergeAttributes(merged.attributes, existing.attributes);
  for (const name of Object.keys(merged.flags)) for (const token of existing.flags[name]) merged.flags[name].add(token);
  return { text: exports.serialize(merged), conflicts };
};
// Config#to_s: settings sorted by key (bytewise, like Ruby's String sort).
exports.serialize = config => [...toHash(config)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key} = ${value}`.trim()).join('\n') + '\n';
exports.attributes = text => parse(text).attributes;
