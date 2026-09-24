import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('local GM switches kiss and bed fixtures while keeping the original save recoverable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dual-pet-gm-'));
  const save = join(dir, 'state-v3.json');
  const bak = `${save}.bak`;
  const original = { version: 1, state: { dialogueCooldown: 20, snapshot: { stage: 1, bond: { value: 15 }, pair: null,
    dialogue: null, pomodoro: { phase: 'idle', resumePhase: 'focus', remainingSeconds: 0 },
    settings: { lunchEnabled: true, nightEnabled: true, bubblesEnabled: false }, pets: {
      'pet-a': { present: true, activity: 'working', progress: { slept: false, faceCompleted: false, workedTogether: false, kissed: false } },
      'pet-b': { present: false, activity: 'sleeping', progress: { slept: false, faceCompleted: false, workedTogether: false, kissed: false } },
    } } } };
  const originalBytes = `${JSON.stringify(original)}\n`;
  try {
    writeFileSync(save, originalBytes);
    writeFileSync(bak, originalBytes);
    const run = command => execFileSync(process.execPath,
      [new URL('../scripts/gm-local.mjs', import.meta.url).pathname, command, '--data-dir', dir], { encoding: 'utf8' });
    run('kiss');
    let snapshot = JSON.parse(readFileSync(save, 'utf8')).state.snapshot;
    assert.equal(snapshot.stage, 2);
    assert.equal(snapshot.bond.value, 1000);
    assert.equal(snapshot.pomodoro.phase, 'paused');
    assert.equal(snapshot.settings.nightEnabled, false);
    assert.equal(snapshot.pets['pet-a'].progress.kissed, false);
    run('bed');
    snapshot = JSON.parse(readFileSync(save, 'utf8')).state.snapshot;
    assert.equal(snapshot.stage, 3);
    assert.equal(snapshot.bond.value, 4000);
    assert.equal(snapshot.pets['pet-b'].present, true);
    assert.equal(snapshot.pets['pet-b'].progress.kissed, true);
    run('restore');
    assert.equal(readFileSync(save, 'utf8'), originalBytes);
    assert.equal(readFileSync(bak, 'utf8'), originalBytes);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
