# Generated workspace ownership

`NewLayout(stateRoot, identity)` accepts an absolute state root and an existing
absolute project directory. It resolves symlinks and hashes the canonical project
and every target field into separate output namespaces. Revisions reuse a
namespace so regeneration can retain pins; schema, revision and the caller's
input fingerprint must all match before reuse. The fingerprint must cover
resolved configuration, dependency identities/lock content, relevant environment,
native contributions, and helper/tool versions. No tool discovery occurs here.

`Acquire` (or `Manager.Acquire` through the C0 Locker interface) holds an exclusive
OS lease on `<canonical project>/.xplat-ns/workspace.lock`. It serializes project
mutations across destinations and state roots, including separate processes.
Waiting observes context cancellation. Keep this persistent lock file; unlinking
it can create two owners. Darwin/Linux use flock on a local filesystem. Other
hosts explicitly return ErrUnavailable; network filesystem semantics are not
qualified. Independent projects can run concurrently.

With the concrete Ownership returned by Acquire:

1. Inspect the input fingerprint. ErrStale requires regeneration; ErrIncomplete
   means missing/corrupt state or an interrupted staging tree.
2. Begin a fresh stage, selecting native-relative Podfile.lock/Package.resolved
   paths to preserve. Only these regular files are copied, without symlink
   traversal, even when inputs changed. Corrupt prior manifests fail closed.
3. Write native output to Stage.State.NativeDir and bundles to BundleDir. Treat
   Stage.State as read-only metadata. Run mutating tools through Ownership.Run,
   using the real process.Runner. Run serializes mutators and waits for owned
   descendants. Application Output callbacks are rejected under leases; deliver
   diagnostics after releasing ownership.
4. Commit only after all writers finish. The staging tree is renamed to a unique
   generation, then state.json is atomically replaced as the publication point.
   Consume the returned State paths, never infer a current tree from Layout.
   Layout.BundleStaging is the staging container, not a published bundle path.
5. Release after cleanup. Release is repeatable and waits for active Run calls.
   ErrCleanup retains the lock because retirement cannot be confirmed. Cancellation
   of a caller's wait must never release ownership early.

Abort removes only its own staging tree, after writers retire. Interrupted trees,
old generations, and their resolution pins are retained. QuarantineInterrupted
moves abandoned staging aside without deleting it; first confirm any killed
owner's descendants retired. The OS lease alone cannot prove this after an owner
crash. Direct writes and tools outside Run remain the coordinator's responsibility.
Do not mutate published generation paths. No automatic garbage collection occurs.

Atomic publication covers process interruption and ordinary filesystem errors;
power-loss durability of generated content and directory entries is not promised.
Directories are trusted caller-controlled local state, not a security sandbox.
The tests qualify local filesystem/component behavior and actual F1 Node process
integration. They do not run CocoaPods, SPM, helper delivery, or native builds.
