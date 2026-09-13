// Exercise the actual frontend controller with deterministic native-window and
// asset adapters. This does not claim to replace WKWebView/manual UI testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { getWalkAssetDirection } from '../src/assets.ts';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@tauri-apps/api/')) return {url: `mock:${specifier.split('/').at(-1)}`, shortCircuit: true};
    if (specifier === './assets' && context.parentURL?.endsWith('window-pet.ts')) return {url: 'mock:assets', shortCircuit: true};
    if (specifier === './window-geometry') return next('./window-geometry.ts', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) {
      const name = url.slice(5);
      const keys = {window: ['getCurrentWindow','Window','LogicalSize','LogicalPosition','PhysicalPosition','currentMonitor','primaryMonitor','availableMonitors','cursorPosition'], event:['listen'], core:['invoke'], assets:['getBedFrame','getStaticFrame','getWalkFrames','loadSprite']}[name];
      return {format:'module', shortCircuit:true, source:keys.map(key => `export const ${key} = (...args) => globalThis.__petAdapters.${key}(...args);`).join('\n').replace(/export const (Window|LogicalSize|LogicalPosition|PhysicalPosition) = [^\n]+/g, (_, key) => `export const ${key} = globalThis.__petAdapters.${key};`)};
    }
    if (url.endsWith('.ts')) return {format:'module', shortCircuit:true, source:ts.transpileModule(readFileSync(new URL(url),'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
    return next(url, context);
  },
});

class PhysicalPosition { constructor(x,y) {this.x=x;this.y=y;} }
globalThis.__petAdapters={getCurrentWindow:()=>({outerPosition:async()=>({x:200,y:200}),scaleFactor:async()=>2}),PhysicalPosition};
const {WindowPet}=await import('../src/window-pet.ts');
function setup(id='pet-a') {
  const handlers=new Map();
  const element={addEventListener:(name,fn)=>handlers.set(name,fn),setPointerCapture(){},hasPointerCapture:()=>false,classList:{add(){},remove(){}}};
  globalThis.document={querySelector:()=>element,addEventListener(){}};
  const pet=new WindowPet({config:{id,partnerId:id==='pet-a'?'pet-b':'pet-a',baseSize:80,frameMs:id==='pet-a'?100:250},scale:1});
  const positions=[];let joins=0;
  pet.queuePosition=p=>positions.push(p);pet.paint=()=>{};pet.tryJoin=async()=>{joins++;};
  pet.installEvents();
  const fire=async(type,x=100,y=100)=>{await handlers.get(type)({type,button:0,pointerId:1,screenX:x,screenY:y});};
  return {pet,fire,positions,joins:()=>joins};
}
test('Jiang walk assets swap horizontal directions only',()=>{
  assert.equal(getWalkAssetDirection('pet-b','left'),'right');
  assert.equal(getWalkAssetDirection('pet-b','right'),'left');
  for(const d of ['up','down']) assert.equal(getWalkAssetDirection('pet-b',d),d);
  for(const d of ['up','down','left','right']) assert.equal(getWalkAssetDirection('pet-a',d),d);
});
for(const id of ['pet-a','pet-b']) {
 test(`${id}: slow reversal turns before crossing the start and preserves window displacement`,async()=>{
  const {pet,fire,positions}=setup(id);await fire('pointerdown');
  await fire('pointermove',101);assert.equal(pet.pointer.moved,false);
  await fire('pointermove',102);await fire('pointermove',103);assert.equal(pet.direction,'right');
  await fire('pointermove',200);await fire('pointermove',199);await fire('pointermove',198);assert.equal(pet.direction,'right');
  await fire('pointermove',197);assert.equal(pet.direction,'left');
  assert.deepEqual(positions.at(-1),new PhysicalPosition(394,200));
 });
 test(`${id}: vertical turns and stationary events`,async()=>{
  const {pet,fire}=setup(id);await fire('pointerdown');await fire('pointermove',200);
  for(let y=101;y<=103;y++) await fire('pointermove',200,y);
  assert.equal(pet.direction,'down');const time=pet.lastMovement;
  await fire('pointermove',200,103);assert.equal(pet.direction,'down');assert.equal(pet.lastMovement,time);
  for(let y=102;y>=100;y--) await fire('pointermove',200,y);
  assert.equal(pet.direction,'up');
 });
 test(`${id}: release joins once while cancellation never joins`,async()=>{
  for(const type of ['pointerup','pointercancel','lostpointercapture']) {
   const {pet,fire,joins}=setup(id);await fire('pointerdown');await fire('pointermove',120);await fire(type,120);
   await new Promise(resolve=>setImmediate(resolve));assert.equal(pet.pointer,null);assert.equal(joins(),type==='pointerup'?1:0);
  }
 });
}
