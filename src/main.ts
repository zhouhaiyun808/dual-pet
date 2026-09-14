import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PetProfile } from "./types";
import { WindowPet } from "./window-pet";

const app = document.querySelector<HTMLDivElement>("#app")!;
const label = getCurrentWindow().label as "pet-a" | "pet-b";

const profiles: Record<"pet-a" | "pet-b", Omit<PetProfile, "scale">> = {
  "pet-a": {
    config: {
      id: "pet-a",
      name: "陈子奚",
      partnerId: "pet-b",
      emoji: "奚",
      speedPxPerTick: 2.0,
      frameMs: 100,
      baseSize: 80
    },
    minScale: 0.55,
    maxScale: 4
  },
  "pet-b": {
    config: {
      id: "pet-b",
      name: "江晏",
      partnerId: "pet-a",
      emoji: "晏",
      speedPxPerTick: 1.65,
      frameMs: 250,
      baseSize: 80
    },
    minScale: 0.55,
    maxScale: 4
  }
};

// Start both pets at the same small size on each launch.
const profile: PetProfile = {
  ...profiles[label],
  scale: 1
};

app.innerHTML = `
  <div class="pet-shell">
    <div class="pet" id="pet">
      <canvas id="pet-image" aria-label="${profile.config.name}"></canvas>
    </div>
    <div id="pet-status" class="pet-status" hidden role="status"></div>
    <div id="dialogue-bubble" class="dialogue-bubble" hidden aria-live="polite"></div>
  </div>
`;

const pet = new WindowPet(profile);
try {
  await pet.init();
  pet.start();
  await invoke('report_pet_status', { status: `ready dpr=${window.devicePixelRatio} canvas=${document.querySelector('canvas')?.width}x${document.querySelector('canvas')?.height}` });
} catch (error) {
  console.error(error);
  await invoke('report_pet_status', { status: `initialization failed: ${String(error)}` }).catch(console.error);
  pet.destroy();
  app.className = 'startup-error';
  app.replaceChildren();
  const message = document.createElement('p');
  message.textContent = '桌宠加载失败，请退出后重新打开。';
  const quit = document.createElement('button');
  quit.textContent = '退出桌宠';
  quit.addEventListener('click', () => { void invoke('quit_pets'); });
  app.append(message, quit);
  await getCurrentWindow().show().catch(console.error);
}
window.addEventListener('beforeunload', () => pet.destroy(), { once: true });

