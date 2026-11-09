# Registered NativeScript project hooks

The library executes hooks registered in the application's `hooks/` directory or
its NativeScript config. `Resolve` reports active scripts as `Project.Hooks`,
including their lifecycle name, canonical path and SHA-256 digest. Resolution
reads and fingerprints scripts without importing or executing them.

Plugin `package.json` `nativescript.hooks` declarations describe installation.
The package manager's existing hook installer registers them in the project;
the library does not execute a second copy directly from each package. Plugin
hook declarations, referenced scripts and `hooks/` inventories are fingerprinted.
The library does not install dependencies or provide plugin-management commands.

A project can register one script for a point or an ordered directory:

```text
hooks/before-prepare.cjs
hooks/after-prepare/01-assets.cjs
hooks/after-prepare/02-stamp.mjs
```

Config registration uses the upstream shape:

```js
module.exports = {
  id: 'org.example.app',
  hooks: [{ type: 'after-prepare', script: 'scripts/stamp.cjs' }],
};
```

Directory scripts run in lexical order, followed by config entries in declaration
order. The same canonical script registered twice at the same point runs once.
Project hook trees require copied ordinary files; explicit config script paths
are canonicalized. Unknown lifecycle points and executable formats fail by name
instead of being silently skipped. Hidden helper files and README/LICENSE files
are fingerprinted but are not themselves hook registrations.

| Point | Owned boundary |
| --- | --- |
| `before-prepare`, `before-prepareNativeApp` | Before final source capture and native preparation. Source-generating hooks run under the project writer lease; their resulting inputs are resolved again. |
| `after-prepareNativeApp` | Native project and native dependencies are prepared. |
| `after-prepare` | Preparation is complete. For `Build`, the official engine's app bundle is also complete, so hooks can stamp assets without bundling overwriting them. `Prepare` alone does not bundle. |
| `before/after-buildIOS`, `before/after-buildAndroid` | Around native compilation. The after hook receives the produced artifact path. |
| `before-build-task-args` | The actual final Gradle argument array, before invoking the wrapper in its owned build mirror. |
| `before/after-install` | Around successful app installation, before launching the app. Bundle-only restart sync does not install and does not fire these hooks. |

A failed before hook prevents that stage. An after hook runs only after its stage
succeeds; its failure rejects the operation's result. Installation is retained if
an after-install hook rejects launch. Hooks run in owned Node processes with the
project cwd and caller environment overrides. Cancellation retires their owned
children before releasing workspace/device ownership. The embedding process's
cwd, environment, signal handlers and logging settings remain unchanged. Each
lifecycle invocation uses a fresh helper process; module globals do not carry
state between lifecycle points.

Source-generating hooks run before the HMR server starts and once per native
iteration. Both development modes observe project hook registration changes.
Restart mode takes the full native build path when active hooks exist, because
hook code can change native outputs even when the initial source identity matches.

## Bounded invocation contract

A JavaScript/CommonJS/ESM script exports one function. Named injection supports
`hookArgs`, `$projectData` and `$logger`; other service names fail before the
function body runs. A matching `{ name, run(context) }` default export is also
accepted with `context.hookName`, `context.hookArgs` and `context.projectData`.
Returned middleware functions are unsupported and fail explicitly.

```js
module.exports = function (hookArgs, $projectData) {
  const fs = require('node:fs');
  const path = require('node:path');
  fs.writeFileSync(path.join(hookArgs.nativeDir, 'hook-stamp.txt'),
    $projectData.projectDir + '\n');
};
```

`hookArgs` contains `projectDir`, `platform`, `configuration`, `projectData`,
`prepareData`, `buildData` and `platformData`. Prepared stages also receive
`nativeDir` and `bundleDir`; build/install stages receive `artifactPath` when
available, and installation receives `deviceIdentifier`. `platformData` exposes
`platformName` and the prepared `projectRoot`. These inputs are read-only.

`$projectData` and `hookArgs.projectData` are the same read-only subset:
`projectDir`, generated `projectName` (`NativeScriptApp`), `nsConfig`, and, after
native preparation, `platformsDir`. The latter is an owned compatibility alias:
`platformsDir/<platform>` refers to the generated native project. It does not
redirect the caller's `platforms/` directory. Pre-prepare and install hooks do
not receive a prepared native directory or this alias; they use source paths or
the explicit artifact/device inputs for their respective stages.

At `before-build-task-args`, `hookArgs.args` is a mutable array:

```js
module.exports = function (hookArgs) {
  hookArgs.args.push('--offline');
};
```

Only strings without newlines or NULs are accepted, with a bounded array length.
This is a compatibility execution contract, not a sandbox: registered scripts
are trusted project code and can write files or run tools. Console output and
logger messages are not forwarded through the private helper transport; exception
text is withheld. Failures identify the hook and unsupported argument, where
applicable, without exporting arbitrary project logs or secret values. `$logger`
accepts `trace/debug/info/warn/error/out` methods under that output policy.

`checkForChanges`, watch-related hooks, environment/command resolution hooks,
`buildAndroidPlugin`, command-level hooks and middleware wrapping remain
unsupported. The exact reviewed core 9.1.3 CLI-version check remains an explicit
fingerprinted migration, including a registered copy with the reviewed digest;
this is not a general rule for ignoring unknown hooks. See
[the core migration](resolution.md#pinned-core-compatibility-migration).

The public Go/Node/executable extension SDK remains a separate semantic contract;
legacy project hooks neither expose its transport nor change its version.
Canonical OTA startup preparation remains the separate `Options.OTAStartup`
contract and qualification; generic hook execution alone does not qualify a
plugin's native fingerprint or installer behavior.
