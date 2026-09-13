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
class Position { constructor(x,y) {this.x=x;this.y=y;} }
class LogicalPosition extends Position {}
class PhysicalPosition extends Position {}
class LogicalSize {constructor(width,height) {this.width=width;this.height=height;} }
const windows = new Map();
let active, cursor, menus, sleeping, owner, display;
let clearedSelections;
const listeners = new Map();
const native = {
  getCurrentWindow: () => active,
  Window: {getByLabel: async label => windows.get(label)}, LogicalPosition, PhysicalPosition, LogicalSize,
  primaryMonitor: async () => display,
  currentMonitor: async () => display,
  availableMonitors: async () => [display],
  cursorPosition: async () => cursor,
  listen: async () => () => {},
  async invoke(command, args) {
    if (command === 'set_sleeping') sleeping.set(active.label,args.sleeping);
    if (command === 'show_pet_menu') menus.push(args);
    if (command === 'join_pair') {
      if (owner) return null;
      owner=active.label;
      const other = owner === 'pet-a' ? 'pet-b' : 'pet-a';
      windows.get(other).visible=false;
      return sleeping.get(other) ?? false;
    }
    if (command === 'split_pair') {
      const other = active.label === 'pet-a' ? 'pet-b' : 'pet-a';
      owner=null; windows.get(other).visible=true;
      sleeping.set(active.label,false); sleeping.set(other,false);
    }
  },
  getBedFrame: (color, paired) => `${color}/${paired ? 'double':'single'}`,
  getStaticFrame: (id, name) => `${id}/${name}`,
  getWalkFrames: async (id,direction) => [0,1,2].map(i=>`${id}/${direction}/${i}`),
  loadSprite: async () => ({image:{},x:0,y:0,width:80,height:80}),
};
globalThis.__petAdapters = native;
const {WindowPet} = await import('../src/window-pet.ts');
function element() {
  const handlers = new Map();
  return {
    handlers, style:{setProperty(){}}, classList:{add(){},remove(){}},
    addEventListener(name,fn) {handlers.set(name,fn);}, removeEventListener(name){handlers.delete(name);},
    setPointerCapture(){}, hasPointerCapture(){return false;}, releasePointerCapture(){},
    async fire(name, extra={}) {
      const event={type:name,button:0,pointerId:1,screenX:100,screenY:100,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};
      await handlers.get(name)?.(event); return event;
    },
  };
}
async function setup(dpi=2, guestDpi=2, platform='Macintosh') {
  windows.clear(); listeners.clear(); menus=[]; sleeping=new Map(); owner=null;
  display={position:{x:0,y:0},size:{width:3584,height:2240},workArea:{position:{x:0,y:50},size:{width:3584,height:2190}},scaleFactor:2};
  function make(label,scale) {
    return {label,dpi:scale,position:{x:200*scale,y:100*scale},size:{width:112*scale,height:144*scale},visible:true,
      async outerPosition(){return this.position;}, async outerSize(){return this.size;}, async scaleFactor(){return this.dpi;},
      async isVisible(){return this.visible;}, async show(){this.visible=true;},
      async setSize(size){if(this.failResize){this.failResize=false;throw Error('resize failed');}this.size={width:size.width*this.dpi,height:size.height*this.dpi};},
      async setPosition(pos){this.lastPosition=pos;this.position={x:pos.x*(pos instanceof LogicalPosition?this.dpi:1),y:pos.y*(pos instanceof LogicalPosition?this.dpi:1)};},
      async listen(name,fn){listeners.set(`${label}:${name}`,fn);return ()=>listeners.delete(`${label}:${name}`);},
    };
  }
  active=make('pet-a',dpi); windows.set('pet-a',active); windows.set('pet-b',make('pet-b',guestDpi)); cursor={x:200,y:200};
  const petElement=element(), doc=element();
  const context=new Proxy({}, {get:()=>()=>{},set:()=>true});
  const canvas={width:0,height:0,getContext:()=>context};
  doc.querySelector=selector=>selector==='#pet-image'?canvas:petElement;
  globalThis.document=doc;
  clearedSelections=0;
  globalThis.window={devicePixelRatio:dpi,setInterval:()=>1,clearInterval(){},getSelection:()=>({removeAllRanges(){clearedSelections++;}})};
  Object.defineProperty(globalThis,'navigator',{value:{userAgent:platform},configurable:true});
  globalThis.localStorage={setItem(){}};
  const profile={config:{id:'pet-a',partnerId:'pet-b',baseSize:80,frameMs:100},scale:1,minScale:.55,maxScale:4};
  const pet=new WindowPet(profile); await pet.init();
  return {pet, petElement,canvas,doc,profile,win:active};
}
const settle = async () => {for(let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve));};

test('static canvas repaints after Retina scale changes without an animation', async () => {
  const {pet,canvas}=await setup();
  assert.equal(canvas.width,160);
  window.devicePixelRatio=1; pet.paint(100);
  assert.equal(canvas.width,80); pet.destroy();
});
test('Control-click opens menu but never begins dragging or toggles sleep', async () => {
  const {pet,petElement,doc}=await setup();
  await petElement.fire('pointerdown',{ctrlKey:true});
  await petElement.fire('dblclick',{ctrlKey:true});
  await doc.fire('contextmenu',{ctrlKey:true});
  assert.equal(pet.pointer,null); assert.equal(pet.sleeping,false); assert.equal(menus.length,1); pet.destroy();
});
test('Mac recovery uses primary logical coordinates even when window was on a 1x screen', async () => {
  const {pet,win,profile}=await setup(1);
  pet.paired=true;pet.sleeping=true;profile.scale=2;
  await listeners.get('pet-a:pet-recover')({payload:null}); await settle();
  assert(win.lastPosition instanceof LogicalPosition);
  assert.equal(win.lastPosition.x,1668); assert.equal(pet.paired,true); assert.equal(pet.sleeping,true);assert.equal(profile.scale,2); pet.destroy();
});
test('all four pair outcomes preserve directional bed rules', async () => {
  for(const dragged of [false,true]) for(const stationary of [false,true]) {
    const {pet,win}=await setup(2,1);
    pet.sleeping=dragged;sleeping.set('pet-a',dragged);sleeping.set('pet-b',stationary);
    // Place both windows at the same logical location despite different backing scales.
    win.position={x:400,y:200}; windows.get('pet-b').position={x:200,y:100};
    await pet.tryJoin();
    assert.equal(pet.paired,true);assert.equal(pet.sleeping,stationary);
    if(stationary)assert.equal(pet.bedColor,dragged?'green':'blue');
    assert.equal(windows.get('pet-b').visible,false);
    await pet.split();assert.equal(pet.sleeping,false);assert.equal(pet.paired,false);assert.equal(windows.get('pet-b').visible,true);
    pet.destroy();
  }
});
test('sleep resize failure rolls back frontend and native sleeping state', async t => {
  t.mock.method(console, 'error', () => {});
  const {pet,win}=await setup();win.failResize=true;
  await assert.rejects(pet.menuAction('sleep'), /resize failed/);
  assert.equal(pet.sleeping,false);assert.equal(sleeping.get('pet-a'),false);assert.equal(pet.busy,false);pet.destroy();
});
test('quick release flushes the final pointer location before clearing drag', async () => {
  const {pet,petElement,win}=await setup();
  win.position={x:400,y:400};
  const origin={...win.position};
  await petElement.fire('pointerdown');cursor={x:400,y:240};
  await petElement.fire('pointermove',{screenX:200,screenY:120});
  await petElement.fire('pointerup',{screenX:200,screenY:120});await settle();
  assert.equal(win.position.x,origin.x+200);assert.equal(win.position.y,origin.y+40);
  assert.equal(pet.pointer,null);pet.destroy();
});

test('paired menu sleep can select either bed independently of drag bed rules', async t => {
  const {pet}=await setup();pet.paired=true;
  t.mock.method(Math, 'random', () => .1);
  await pet.menuAction('sleep');assert.equal(pet.bedColor,'green');
  await pet.menuAction('sleep');
  Math.random.mock.mockImplementation(() => .9);
  await pet.menuAction('sleep');assert.equal(pet.bedColor,'blue');pet.destroy();
});

test('pointer cancellation never combines pets and releases drag state', async () => {
  const {pet,petElement}=await setup();
  await petElement.fire('pointerdown');cursor={x:220,y:200};
  await petElement.fire('pointermove',{screenX:110});
  await petElement.fire('pointercancel');await settle();
  assert.equal(pet.pointer,null);assert.equal(owner,null);pet.destroy();
});

test('pet-b walk assets swap only horizontal directions at the loading layer', () => {
  assert.equal(getWalkAssetDirection('pet-b', 'left'), 'right');
  assert.equal(getWalkAssetDirection('pet-b', 'right'), 'left');
  assert.equal(getWalkAssetDirection('pet-b', 'up'), 'up');
  assert.equal(getWalkAssetDirection('pet-b', 'down'), 'down');
  assert.equal(getWalkAssetDirection('pet-a', 'left'), 'left');
});

for (const platform of ['Macintosh', 'Windows']) {
  test(`drag direction uses recent movement and accumulates slow steps (${platform})`, async () => {
    const {pet,petElement}=await setup(2,2,platform);
    await petElement.fire('pointerdown');
    await petElement.fire('pointermove',{screenX:101,screenY:100});
    await petElement.fire('pointermove',{screenX:102,screenY:100});
    await petElement.fire('pointermove',{screenX:103,screenY:100});
    assert.equal(pet.direction,'right');
    await petElement.fire('pointermove',{screenX:200,screenY:100});
    assert.equal(pet.direction,'right');
    // A small reversal turns only after its own recent-motion threshold; it
    // never needs to cross the original pointer-down position.
    await petElement.fire('pointermove',{screenX:199,screenY:100});
    assert.equal(pet.direction,'right');
    await petElement.fire('pointermove',{screenX:198,screenY:100});
    assert.equal(pet.direction,'right');
    await petElement.fire('pointermove',{screenX:197,screenY:100});
    await settle();
    assert.equal(pet.direction,'left');
    pet.destroy();
  });

  test(`drag direction handles vertical turns and ignores zero displacement (${platform})`, async () => {
    const {pet,petElement}=await setup(2,2,platform);
    await petElement.fire('pointerdown');
    await petElement.fire('pointermove',{screenX:100,screenY:101});
    await petElement.fire('pointermove',{screenX:100,screenY:102});
    await petElement.fire('pointermove',{screenX:100,screenY:103});
    assert.equal(pet.direction,'down');
    const lastMovement=pet.lastMovement;
    await petElement.fire('pointermove',{screenX:100,screenY:103});
    assert.equal(pet.direction,'down');
    assert.equal(pet.lastMovement,lastMovement);
    await petElement.fire('pointermove',{screenX:100,screenY:102});
    await petElement.fire('pointermove',{screenX:100,screenY:100});
    await settle();
    assert.equal(pet.direction,'up');
    await petElement.fire('pointercancel');pet.destroy();
  });
}

test('selection and native image dragging are blocked, then listeners are cleaned up', async () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /-webkit-user-select\s*:\s*none/);
  assert.match(css, /-webkit-user-drag\s*:\s*none/);
  const {pet, petElement, doc}=await setup();
  const selection = await doc.fire('selectstart');
  const nativeDrag = await doc.fire('dragstart');
  assert.equal(selection.defaultPrevented, true);
  assert.equal(nativeDrag.defaultPrevented, true);
  assert.equal(clearedSelections, 2);
  const down = await petElement.fire('pointerdown');
  assert.equal(down.defaultPrevented, true);
  await petElement.fire('pointercancel');
  pet.destroy();
  const afterDestroy = await doc.fire('selectstart');
  assert.equal(afterDestroy.defaultPrevented, false);
});

test('normal double-click keeps the existing sleep action while suppressing browser default', async () => {
  const {pet, petElement}=await setup();
  const dblclick = await petElement.fire('dblclick');
  await settle();
  assert.equal(dblclick.defaultPrevented, true);
  assert.equal(pet.sleeping, true);
  pet.destroy();
});
