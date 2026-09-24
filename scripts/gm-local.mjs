#!/usr/bin/env node
// Local macOS save switch for quickly exercising the kiss and double-bed flows.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const [command, option, optionValue] = process.argv.slice(2);
const override = option === '--data-dir' && optionValue && process.argv.length === 5;
if (process.platform !== 'darwin' && !override) throw new Error('This GM switch is for the local macOS app.');
if (!['kiss', 'bed', 'restore', 'status'].includes(command) || (option && !override)) {
  throw new Error('Usage: node scripts/gm-local.mjs kiss|bed|restore|status [--data-dir PATH]');
}
const dataDir = override ? resolve(optionValue) : join(homedir(), 'Library/Application Support/com.haiyunzhou.dualpet');
const savePath = join(dataDir, 'state-v3.json');
const backupPath = `${savePath}.bak`;
const gmDir = join(dataDir, 'gm-original');
const gmSave = join(gmDir, 'state-v3.json');
const gmBackup = join(gmDir, 'state-v3.json.bak');

if (!override) {
  try {
    const running = execFileSync('pgrep', ['-x', 'dual-pet'], { encoding: 'utf8' }).trim();
    if (running) throw new Error('请先退出 Dual Pet，再切换或恢复测试存档。');
  } catch (error) {
    if (error.status !== 1) throw error;
  }
}

function readSave(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.version !== 1 || !data.state?.snapshot?.pets?.['pet-a'] || !data.state.snapshot.pets['pet-b']) {
    throw new Error(`不是当前版本的有效存档：${path}`);
  }
  return data;
}
function atomicCopy(source, destination) {
  const temp = `${destination}.gm-${process.pid}.tmp`;
  try { copyFileSync(source, temp); renameSync(temp, destination); }
  finally { if (existsSync(temp)) rmSync(temp); }
}
function atomicJson(destination, data) {
  const temp = `${destination}.gm-${process.pid}.tmp`;
  try { writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`); renameSync(temp, destination); }
  finally { if (existsSync(temp)) rmSync(temp); }
}

if (command === 'status') {
  if (!existsSync(savePath)) { console.log('尚无本地存档；先启动并退出一次应用。'); process.exit(0); }
  const { snapshot } = readSave(savePath).state;
  console.log(`阶段 ${snapshot.stage}；羁绊 ${snapshot.bond.value}；GM 原始备份${existsSync(gmSave) ? '已保存' : '未创建'}`);
  process.exit(0);
}
if (command === 'restore') {
  if (!existsSync(gmSave)) throw new Error('没有可恢复的 GM 原始备份。');
  readSave(gmSave);
  atomicCopy(gmSave, savePath);
  if (existsSync(gmBackup)) atomicCopy(gmBackup, backupPath);
  else if (existsSync(backupPath)) rmSync(backupPath);
  rmSync(gmDir, { recursive: true });
  console.log('已恢复 GM 使用前的主存档和备份。');
  process.exit(0);
}

if (!existsSync(savePath)) throw new Error('尚无本地存档；先启动并退出一次应用。');
readSave(savePath);
if (!existsSync(gmSave)) {
  mkdirSync(gmDir, { mode: 0o700 });
  copyFileSync(savePath, gmSave, constants.COPYFILE_EXCL);
  if (existsSync(backupPath)) copyFileSync(backupPath, gmBackup, constants.COPYFILE_EXCL);
}
const data = readSave(gmSave);
const { snapshot } = data.state;
snapshot.stage = command === 'kiss' ? 2 : 3;
snapshot.bond.value = command === 'kiss' ? 1000 : 4000;
snapshot.pair = null;
snapshot.dialogue = null;
snapshot.pomodoro.phase = 'paused';
snapshot.pomodoro.resumePhase = 'focus';
snapshot.pomodoro.remainingSeconds = Math.max(1, snapshot.pomodoro.remainingSeconds);
snapshot.settings.lunchEnabled = false;
snapshot.settings.nightEnabled = false;
snapshot.settings.bubblesEnabled = true;
data.state.dialogueCooldown = 0;
for (const pet of Object.values(snapshot.pets)) {
  pet.present = true;
  pet.activity = 'standing';
  pet.progress.slept = true;
  pet.progress.faceCompleted = true;
  pet.progress.workedTogether = command === 'bed';
  pet.progress.kissed = command === 'bed';
}
atomicJson(savePath, data);
console.log(command === 'kiss'
  ? '已切换到亲亲验证进度。启动应用后将两人合体，等待面对面对话结束。'
  : '已切换到双人床验证进度。启动应用后将两人合体，再用右键菜单切换双人睡眠。');
console.log(`原始存档保存在 ${gmDir}；验证结束运行 node scripts/gm-local.mjs restore`);
