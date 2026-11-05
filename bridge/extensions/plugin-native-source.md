# Selected plugin native source identity

`plugin-native-source.cjs` formats already-resolved plugin `ios.NativeSource`
groups for the reviewed canonical0.19 data-only extra-source contract. It neither
executes package configs nor installs, edits or copies dependencies.

The private Go handoff carries each group's name, absolute expanded pattern and
root, concrete real file membership, real declaring package directory and
original selector. App groups retain their existing snapshot path. Plugin names
are unique within each config, not across different packages.

`collect({groups, sourceFiles})` verifies the real owner, its manifest and config
file hashes, current exact selector membership and selected file hashes against
the leased resolver inputs. Missing/new/changed matches and stale metadata fail.
Relative selectors can refer to shared workspace sources outside the package.
Absolute selectors and symlinked source ancestry fail unavailable for OTA.

The result contains reserved ID `xplat-ns/plugin-native-source/v1`, stable JSON
contents and its SHA256. Contents include sorted groups with owner name/version,
selector name and normalized owner-relative pattern/file hashes. Absolute paths
appear only in private freshness inputs. Group order is irrelevant; separate
physical instances retain multiplicity. Descriptor checks do not prove native
compilation, ABI, installer behavior or a complete original-source graph.

`verified(request)` also returns a recheck that repeats exact membership and hash
validation after canonical production. The OTA adapter adds the contents source
alongside existing local-SPM/extension inputs, rejects caller ID collisions, and
requires exactly one matching canonical record before publishing. Ignore rules
cannot silently exclude the descriptor. The caller's native generation/stamp is
preserved when verification rejects.
