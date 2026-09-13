import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Tauri's CI mode skips only the Finder cosmetics in the DMG builder. The app,
// Applications shortcut, compression and signature checks are still generated.
const env = { ...process.env };
if (process.platform === 'darwin') env.CI = 'true';
const result = spawnSync(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'build', ...process.argv.slice(2)], { env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
