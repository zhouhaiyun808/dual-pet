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
    if (specifier.startsWith('./') && !specifier.match(/\.[a-z]+$/i) && context.parentURL?.endsWith('.ts')) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) {
      const name = url.slice(5);
      const keys = {window: ['getCurrentWindow','Window','LogicalSize','LogicalPosition','PhysicalPosition','currentMonitor','primaryMonitor','availableMonitors','cursorPosition'], event:['listen'], core:['invoke'], assets:['getBedFrame','getStaticFrame','getWalkFrames','getWorkFrameNames','getWorkFrameUrl','loadSprite','loadWorkFrameSprite']}[name];
      const source=keys.map(key => `export const ${key} = (...args) => globalThis.__petAdapters.${key}(...args);`).join('\n').replace(/export const (Window|LogicalSize|LogicalPosition|PhysicalPosition) = [^\n]+/g, (_, key) => `export const ${key} = globalThis.__petAdapters.${key};`);
      return {format:'module', shortCircuit:true, source:name==='assets'?`${source}\nexport const singleAttachmentAnchors = {'pet-a':{standing:46,working:512},'pet-b':{standing:46,working:512}};`:source};
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
let active, cursor, menus, sleeping, owner, display, state;
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
    if (command === 'get_app_state') return structuredClone(state);
    if (command === 'get_input_counts') return {sequence:1,stateRevision:state.revision,inputStatus:'listening',total:{...state.inputTotals},pets:{'pet-a':{day:state.inputTotals.day,todayKeys:0,todayClicks:0},'pet-b':{day:state.inputTotals.day,todayKeys:0,todayClicks:0}}};
    if (command === 'get_double_click_interval') return 300;
    if (command === 'dispatch_action') {
      const action=args.action; const id=action.pet ?? active.label;
      if(action.kind==='activity') state.pets[id].activity=action.activity;
      if(action.kind==='join') {state.pair={owner:id,mode:'face-dialogue',ownLeft:action.ownLeft??true,bedColor:'green'}; owner=id; windows.get(id==='pet-a'?'pet-b':'pet-a').visible=false;}
      if(action.kind==='split') {state.pair=null;owner=null;windows.get(id==='pet-a'?'pet-b':'pet-a').visible=true;}
      if(action.kind==='pair-sleep-toggle' && state.pair) state.pair.mode=state.pair.mode==='double-sleep'?'kiss':'double-sleep';
      if(action.kind==='pair-cycle' && state.pair) state.pair.mode=state.pair.mode==='shared-work'?'double-sleep':state.pair.mode==='double-sleep'?'kiss':'shared-work';
      if(action.kind==='pomodoro-pause') {state.pomodoro.resumePhase=state.pomodoro.phase;state.pomodoro.phase='paused';}
      if(action.kind==='pomodoro-resume') state.pomodoro.phase=state.pomodoro.resumePhase;
      if(action.kind==='pomodoro-start') {state.pomodoro.phase='focus';state.pomodoro.remainingSeconds=1500;}
      state.revision++; return structuredClone(state);
    }
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
  getWorkFrameNames: scene => scene === 'dual-jiangchen'
    ? ['idle','chen-stroke','chen-blink','jiang-book-closed','jiang-blink']
    : scene === 'solo-chen' ? ['idle','chen-blink','chen-stroke'] : ['idle','jiang-blink','jiang-book-closed'],
  getWorkFrameUrl: (scene,frame) => `work/${scene}/${frame}`,
  loadWorkFrameSprite: async scene => ({image:{},x:0,y:0,width:scene.includes('dual')?208:114,height:100}),
  loadSprite: async () => ({image:{},x:0,y:0,width:80,height:80}),
};
globalThis.__petAdapters = native;
const {WindowPet} = await import('../src/window-pet.ts');
function element() {
  const handlers = new Map();
  return {
    handlers, dataset:{}, style:{setProperty(){}}, classList:{add(){},remove(){},contains(){return false;}},
    setAttribute(){},
    addEventListener(name,fn) {handlers.set(name,fn);}, removeEventListener(name){handlers.delete(name);},
    setPointerCapture(){}, hasPointerCapture(){return false;}, releasePointerCapture(){},
    async fire(name, extra={}) {
      const event={type:name,button:0,pointerId:1,screenX:100,screenY:100,defaultPrevented:false,propagationStopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...extra};
      await handlers.get(name)?.(event); return event;
    },
  };
}
async function setup(dpi=2, guestDpi=2, platform='Macintosh') {
  windows.clear(); listeners.clear(); menus=[]; sleeping=new Map(); owner=null;
  display={position:{x:0,y:0},size:{width:3584,height:2240},workArea:{position:{x:0,y:50},size:{width:3584,height:2190}},scaleFactor:2};
  const progress={day:'2026-09-14',personalGrowth:0,dailyEarned:0,dailyFocusEarned:0,keyPresses:0,mouseClicks:0,todayKeys:0,todayClicks:0,companionSeconds:0,slept:false,faceCompleted:false,workedTogether:false,kissed:false};
  state={revision:1,pets:{'pet-a':{present:true,activity:'standing',progress:{...progress}},'pet-b':{present:true,activity:'standing',progress:{...progress}}},inputTotals:{day:'2026-09-14',todayKeys:0,todayClicks:0},pair:null,stage:3,settings:{bubblesEnabled:true,focusMinutes:25},pomodoro:{phase:'idle',resumePhase:'focus',remainingSeconds:0,completedRounds:0},dialogue:null,sleepSlot:null,inputStatus:'listening',storageWarning:null,unlockedDialogues:[]};
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
  const petElement=element(), widget={...element(),hidden:true,getBoundingClientRect:()=>({width:184,height:70})}, widgetClose=element(), widgetToggle=element();
  const widgetPhase=element(), widgetTime=element(), widgetKeys=element(), widgetClicks=element();
  const bubbleText=element();
  const bubble={...element(),hidden:true,textContent:'',getBoundingClientRect:()=>({width:240,height:108})}, status={...element(),hidden:true,textContent:'',getBoundingClientRect:()=>({width:100,height:30})}, doc=element();
  const context=new Proxy({}, {get:()=>()=>{},set:()=>true});
  const canvas={width:0,height:0,getContext:()=>context};
  const elements={'#pet-image':canvas,'#dialogue-bubble':bubble,'#dialogue-text':bubbleText,'#pet-status':status,'#desktop-widget':widget,'#desktop-widget-close':widgetClose,'#desktop-widget-toggle':widgetToggle,'#desktop-widget-phase':widgetPhase,'#desktop-widget-time':widgetTime,'#desktop-widget-keys':widgetKeys,'#desktop-widget-clicks':widgetClicks,'#pet':petElement};
  doc.querySelector=selector=>elements[selector]??petElement;
  globalThis.document=doc;
  clearedSelections=0;
  globalThis.window={devicePixelRatio:dpi,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,getSelection:()=>({removeAllRanges(){clearedSelections++;}})};
  Object.defineProperty(globalThis,'navigator',{value:{userAgent:platform},configurable:true});
  const stored=new Map();
  globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem(key,value){stored.set(key,value);}};
  const profile={config:{id:'pet-a',partnerId:'pet-b',baseSize:80,frameMs:100},scale:1,minScale:.55,maxScale:4};
  const pet=new WindowPet(profile); await pet.init();
  return {pet, petElement,canvas,doc,profile,win:active,widget,widgetClose,widgetToggle,widgetPhase,widgetTime,bubble,bubbleText};
}
const settle = async () => {for(let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve));};

test('static canvas repaints after Retina scale changes without an animation', async () => {
  const {pet,canvas}=await setup();
  assert.equal(canvas.width,232);
  window.devicePixelRatio=1; pet.paint(100);
  assert.equal(canvas.width,116); pet.destroy();
});
test('widget pause and resume controls dispatch without leaking into pet gestures', async () => {
  const {pet,widgetToggle}=await setup();
  state.pomodoro.phase='focus';state.pomodoro.remainingSeconds=1200;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widgetToggle.dataset.control,'pause');
  await widgetToggle.fire('pointerdown');await widgetToggle.fire('click');await settle();
  assert.equal(state.pomodoro.phase,'paused');
  assert.equal(pet.pointer,null);
  assert.equal(widgetToggle.dataset.control,'resume');
  await widgetToggle.fire('click');await settle();
  assert.equal(state.pomodoro.phase,'focus');
  pet.destroy();
});

test('idle widget starts focus directly and uses the shared play-button slot', async () => {
  const {pet,widgetToggle}=await setup();
  assert.equal(widgetToggle.dataset.control,'start');
  assert.equal(widgetToggle.dataset.action,'pomodoro-start');
  await widgetToggle.fire('pointerdown');await widgetToggle.fire('click');await settle();
  assert.equal(state.pomodoro.phase,'focus');
  assert.equal(pet.pointer,null);
  assert.equal(widgetToggle.dataset.control,'pause');
  pet.destroy();
});

test('dialogue uses the fixed measured bubble and system reminders omit a prefix', async () => {
  const {pet,bubble,bubbleText,widget}=await setup();
  display.workArea.size.width=160;
  state.dialogue={kind:'break-reminder',id:99,index:0,remainingSeconds:8,lines:[{speaker:'system',text:'休息一下，起来动动吧'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(bubble.hidden,false);
  assert.equal(bubbleText.textContent,'休息一下，起来动动吧');
  assert.equal(bubble.style.width,undefined);
  assert.equal(pet.bubbleWidth,240);
  assert.equal(pet.bubbleHeight,108);
  assert.equal(widget.hidden,true);
  assert.equal(pet.widgetWidth,0);
  assert.equal(pet.widgetHeight,0);
  state.dialogue={kind:'break-reminder',id:100,index:0,remainingSeconds:8,lines:[{speaker:'system',text:'这是一段更长的休息提醒文字，但不能改变泡泡的固定外框几何。'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(pet.bubbleWidth,240);
  assert.equal(pet.bubbleHeight,108);
  state.dialogue={kind:'shared-work',id:101,index:0,remainingSeconds:2.2,continuationIndices:[1],lines:[
    {speaker:'pet-a',text:'早备好了，'},{speaker:'pet-a',text:'就等江大侠点头。'},
    {speaker:'pet-a',text:'走吧。'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(bubbleText.textContent,'陈子奚：早备好了，');
  state.dialogue.index=1;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(bubbleText.textContent,'就等江大侠点头。');
  state.dialogue.index=2;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(bubbleText.textContent,'陈子奚：走吧。');
  pet.destroy();
});

test('dialogue CSS uses fixed, proportional image layers and separate text areas', () => {
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  const bubble=css.match(/\.dialogue-bubble \{[^}]+\}/)?.[0]??'';
  const image=css.match(/\.dialogue-bubble::before \{[^}]+\}/)?.[0]??'';
  const textLane=css.match(/\.dialogue-bubble > span \{[^}]+\}/)?.[0]??'';
  const reminder=css.match(/\.dialogue-bubble\.reminder > span \{[^}]+\}/)?.[0]??'';
  assert.match(bubble,/width:240px; height:108px/);
  assert.match(image,/width:240px; height:80px; background-position:center; background-size:240px 80px/);
  assert.equal(240/80,2172/724);
  assert.doesNotMatch(css,/border-image|background-size:100% 100%/);
  assert.match(bubble,/font:14px/);
  assert.match(textLane,/left:26px; top:14px/);
  assert.match(textLane,/width:188px; height:80px/);
  assert.match(textLane,/justify-content:center/);
  assert.match(textLane,/white-space:nowrap/);
  assert.match(reminder,/left:35px; top:32px; width:170px/);
  assert.match(reminder,/text-align:center/);
  for(const name of ['dialogue-chen','dialogue-jiang','rest-reminder']) assert.match(css,new RegExp(`${name}\\.png`));
});

test('dialogue temporarily suppresses the widget and restores only persisted visibility', async () => {
  const {pet,widget}=await setup();
  assert.equal(widget.hidden,false);
  state.dialogue={kind:'solo-growth',id:1,index:0,remainingSeconds:8,lines:[{speaker:'pet-a',text:'你好。'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  assert.equal(pet.widgetWidth,0);
  assert.equal(pet.widgetHeight,0);
  assert.equal(localStorage.getItem('desktop-widget-visible:pet-a'),null);
  state.dialogue=null;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  assert.equal(pet.widgetWidth,184);
  assert.equal(pet.widgetHeight,70);

  await pet.menuAction('widget-hide');
  assert.equal(localStorage.getItem('desktop-widget-visible:pet-a'),'false');
  state.dialogue={kind:'solo-growth',id:2,index:0,remainingSeconds:8,lines:[{speaker:'pet-a',text:'再次见面。'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  state.dialogue=null;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  assert.equal(pet.widgetWidth,0);
  assert.equal(pet.widgetHeight,0);
  pet.destroy();
});

test('hiding the widget during dialogue prevents it from reviving afterward', async () => {
  const {pet,widget}=await setup();
  state.dialogue={kind:'solo-growth',id:1,index:0,remainingSeconds:8,lines:[{speaker:'pet-a',text:'你好。'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  await pet.menuAction('widget-hide');
  assert.equal(localStorage.getItem('desktop-widget-visible:pet-a'),'false');
  state.dialogue=null;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  assert.equal(pet.widgetWidth,0);
  assert.equal(pet.widgetHeight,0);
  pet.destroy();
});

test('an error clears dialogue suppression and restores the persisted widget', async () => {
  const {pet,bubble,widget}=await setup();
  state.dialogue={kind:'solo-growth',id:1,index:0,remainingSeconds:8,lines:[{speaker:'pet-a',text:'你好。'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  pet.showError('unexpected backend detail');
  assert.equal(bubble.hidden,true);
  assert.equal(widget.hidden,false);
  assert.equal(pet.widgetWidth,184);
  assert.equal(pet.widgetHeight,70);
  pet.destroy();
});

test('pairing without dialogue inherits the visible single widget without a hidden frame', async () => {
  const {pet,widget}=await setup();
  localStorage.setItem('desktop-widget-visible:paired','false');
  const visibility=[];
  let hidden=widget.hidden;
  Object.defineProperty(widget,'hidden',{get:()=>hidden,set:value=>{hidden=value;visibility.push(value);}});
  state.pair={owner:'pet-a',mode:'face-dialogue',ownLeft:true,bedColor:'green'};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  assert.equal(pet.widgetWidth,184);
  assert.equal(pet.widgetHeight,70);
  assert.equal(localStorage.getItem('desktop-widget-visible:paired'),'true');
  assert.deepEqual(visibility,[false]);
  state.pair=null;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  assert.deepEqual(visibility,[false,false]);
  pet.destroy();
});

test('pairing with dialogue suppresses then restores the inherited widget', async () => {
  const {pet,widget}=await setup();
  localStorage.setItem('desktop-widget-visible:paired','false');
  state.pair={owner:'pet-a',mode:'face-dialogue',ownLeft:true,bedColor:'green'};
  state.dialogue={kind:'face-dialogue',id:3,index:0,remainingSeconds:8,lines:[{speaker:'pet-a',text:'你好。'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  assert.equal(pet.widgetWidth,0);
  assert.equal(localStorage.getItem('desktop-widget-visible:paired'),'true');
  state.dialogue=null;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  assert.equal(pet.widgetWidth,184);
  assert.equal(pet.widgetHeight,70);
  pet.destroy();
});

test('pairing keeps the widget when only the partner has it enabled', async () => {
  const {pet,widget}=await setup();
  await pet.menuAction('widget-hide');
  assert.equal(widget.hidden,true);
  state.pair={owner:'pet-a',mode:'face-dialogue',ownLeft:true,bedColor:'green'};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  assert.equal(pet.widgetWidth,184);
  assert.equal(pet.widgetHeight,70);
  assert.equal(localStorage.getItem('desktop-widget-visible:paired'),'true');
  pet.destroy();
});

test('pairing keeps the widget when only the owner has it enabled', async () => {
  const {pet,widget}=await setup();
  localStorage.setItem('desktop-widget-visible:pet-b','false');
  state.pair={owner:'pet-a',mode:'face-dialogue',ownLeft:true,bedColor:'green'};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  assert.equal(pet.widgetWidth,184);
  assert.equal(localStorage.getItem('desktop-widget-visible:paired'),'true');
  pet.destroy();
});

test('pairing leaves the widget closed when both single widgets are closed', async () => {
  const {pet,widget}=await setup();
  await pet.menuAction('widget-hide');
  localStorage.setItem('desktop-widget-visible:pet-b','false');
  state.pair={owner:'pet-a',mode:'face-dialogue',ownLeft:true,bedColor:'green'};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  assert.equal(pet.widgetWidth,0);
  assert.equal(pet.widgetHeight,0);
  assert.equal(localStorage.getItem('desktop-widget-visible:paired'),'false');
  pet.destroy();
});

test('closing the paired widget during dialogue keeps it closed afterward', async () => {
  const {pet,widget}=await setup();
  state.pair={owner:'pet-a',mode:'face-dialogue',ownLeft:true,bedColor:'green'};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  state.dialogue={kind:'face-dialogue',id:4,index:0,remainingSeconds:8,lines:[{speaker:'pet-a',text:'你好。'}]};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  await pet.menuAction('widget-hide');
  assert.equal(localStorage.getItem('desktop-widget-visible:paired'),'false');
  state.dialogue=null;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,true);
  assert.equal(pet.widgetWidth,0);
  assert.equal(pet.widgetHeight,0);
  state.pair=null;state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  state.pair={owner:'pet-a',mode:'kiss',ownLeft:false,bedColor:'blue'};state.revision++;
  pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
  assert.equal(widget.hidden,false);
  assert.equal(localStorage.getItem('desktop-widget-visible:paired'),'true');
  pet.destroy();
});

test('shared work keeps Chen on the left while face dialogue follows ownLeft', async () => {
  const {pet,bubble}=await setup();
  const positions={};
  for(const mode of ['shared-work','face-dialogue']) for(const ownLeft of [true,false]) for(const speaker of ['pet-a','pet-b']) {
    state.pair={owner:'pet-a',mode,ownLeft,bedColor:'green'};
    state.dialogue={kind:mode,id:100+state.revision,index:0,remainingSeconds:8,lines:[{speaker,text:'你好。'}]};state.revision++;
    pet.enqueueSnapshot(structuredClone(state));await pet.snapshotWork;
    positions[`${mode}:${ownLeft}:${speaker}`]=Number.parseInt(bubble.style.left,10);
  }
  assert.equal(positions['shared-work:true:pet-a'],positions['shared-work:false:pet-a']);
  assert.equal(positions['shared-work:true:pet-b'],positions['shared-work:false:pet-b']);
  assert.equal(positions['shared-work:true:pet-b']-positions['shared-work:true:pet-a'],84);
  assert.equal(positions['face-dialogue:true:pet-a'],positions['face-dialogue:false:pet-b']);
  assert.equal(positions['face-dialogue:true:pet-b'],positions['face-dialogue:false:pet-a']);
  assert.equal(positions['face-dialogue:true:pet-b']-positions['face-dialogue:true:pet-a'],84);
  pet.destroy();
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
  assert.equal(win.lastPosition.x,1580); assert.equal(pet.paired,true); assert.equal(pet.sleeping,true);assert.equal(profile.scale,2); pet.destroy();
});
test('single and paired activity cycles keep one stable drawing envelope', async () => {
  const {pet,canvas}=await setup();
  const single=pet.geometry();
  for(const activity of ['working','sleeping','standing']) {
    pet.working=activity==='working'; pet.sleeping=activity==='sleeping'; pet.lastPaint=''; pet.paint(performance.now());
    assert.deepEqual(pet.geometry(),single);
    assert.deepEqual([canvas.width,canvas.height],[single.width*2,single.height*2]);
  }
  pet.paired=true;
  const paired=pet.geometry();
  for(const mode of ['face','work','sleep','kiss']) {
    pet.faceMode=mode==='face';pet.working=mode==='work';pet.sleeping=mode==='sleep';pet.lastPaint='';pet.paint(performance.now());
    assert.deepEqual(pet.geometry(),paired);
    assert.deepEqual([canvas.width,canvas.height],[paired.width*2,paired.height*2]);
  }
  pet.destroy();
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

test('entering single standing resets a dragged pet to the initial front frame', async () => {
  const {pet}=await setup();
  pet.direction='right'; pet.frame=7; pet.lastMovement=123;
  state.pets['pet-a'].activity='working'; state.revision++;
  pet.enqueueSnapshot(structuredClone(state)); await pet.snapshotWork;
  state.pets['pet-a'].activity='standing'; state.revision++;
  pet.enqueueSnapshot(structuredClone(state)); await pet.snapshotWork;
  assert.equal(pet.direction,'down');assert.equal(pet.frame,0);assert.equal(pet.lastMovement,0);
  pet.destroy();
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

test('normal double-click follows the same state cycle while suppressing browser default', async () => {
  const {pet, petElement}=await setup();
  const dblclick = await petElement.fire('dblclick');
  await settle();
  assert.equal(dblclick.defaultPrevented, true);
  assert.equal(pet.working, true);
  pet.destroy();
});
