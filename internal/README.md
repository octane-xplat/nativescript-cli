# Internal package map

These directories reserve implementation boundaries. Empty placeholders do not
represent implemented packages or APIs.

| Directory | Responsibility |
| --- | --- |
| `cli/` | Command parsing and human/JSON presentation |
| `workflow/` | Resolve/prepare/build/run orchestration |
| `project/` | Internal normalized project and native contributions |
| `resolve/` | App configuration and installed dependency resolution |
| `process/` | Process ownership, streaming output and cancellation |
| `workspace/` | Generated files, locks, staging and build state |
| `jsbridge/` | Private helper lifecycle and transport |
| `bundle/` | Vite bundle/server lifecycle |
| `extensions/` | JS, executable Go and directly registered extensions |
| `ios/prepare/` | Native iOS project preparation |
| `ios/pods/` | CocoaPods integration |
| `ios/spm/` | Swift Package Manager integration |
| `ios/build/` | Xcode builds, signing inputs and artifacts |
| `ios/device/` | simctl/devicectl operations |
| `android/prepare/` | Native Android project preparation |
| `android/build/` | Gradle builds, signing inputs and artifacts |
| `android/device/` | ADB operations |

Different tracks can implement against agreed fixtures and narrow contracts.
Keep actual project writes coordinated through workspace ownership. Private
packages must not leak into public Go request/result signatures.
