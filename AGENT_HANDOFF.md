# Agent Handoff

## Purpose and architecture

Dual Pet is a two-character Windows desktop pet built with Tauri 2, Rust, TypeScript, and Vite. Read `PROJECT_CONTEXT.md` for architecture and product decisions.

## Current checkpoint

- Branch: `main`
- Platform represented by `main`: Windows
- Version: `0.2.0`
- macOS branch: not created; create `macos` only when macOS work actually starts

## Completed

- Existing Windows application and assets are present.
- Repository documentation and safe ignore rules are prepared for cross-computer synchronization.
- Generated applications, installers, dependencies, caches, and Rust build output are intentionally excluded.

## Verification

```powershell
npm install
npm run build
npm run tauri:dev
```

Build an NSIS package with `npm run tauri:build`.

## Known limitations

- Windows 10/11 x64 is the only currently supported platform.
- WebView2 Runtime is required on target Windows computers.
- Bed and scheduled sleep behavior are not implemented.
- GitHub does not reproduce local application state, installed toolchains, Codex credentials, or full chat transcripts.

## Next recommended task

On the receiving computer, clone `dual-pet`, install dependencies, run `npm run build`, and verify the native app with `npm run tauri:dev`.

## External state

- Packaged executables and installers remain local and are excluded from Git.
- Personal Codex skills, including `hatch-pet`, remain outside the repository.
- No macOS branch should exist yet.
