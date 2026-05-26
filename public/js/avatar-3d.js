/** 3D collector avatar — Three.js bust with shop part variants */

import * as THREE from "https://esm.sh/three@0.170.0";
import { avatarSelection, findAvatarItem } from "./avatar-catalog.js";

const SKIN = 0xc68642;
const mounts = new WeakMap();

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.08,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: Boolean(opts.transparent),
    opacity: opts.opacity ?? 1,
  });
}

function addMesh(group, geometry, material, position, rotation, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  if (scale) {
    if (Array.isArray(scale)) mesh.scale.set(...scale);
    else mesh.scale.setScalar(scale);
  }
  group.add(mesh);
  return mesh;
}

function buildHair(group, hairId) {
  const dark = mat(0x2b2118);
  const headY = 0.52;

  switch (hairId) {
    case "curly":
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        addMesh(
          group,
          new THREE.SphereGeometry(0.11, 10, 10),
          dark,
          [Math.cos(a) * 0.18, headY + 0.08 + Math.sin(i) * 0.02, Math.sin(a) * 0.18]
        );
      }
      break;
    case "wave":
      addMesh(group, new THREE.SphereGeometry(0.34, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), dark, [0, headY + 0.02, -0.02], [0.15, 0, 0]);
      break;
    case "cap": {
      const cap = mat(0x1d3557);
      addMesh(group, new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), cap, [0, headY + 0.02, 0]);
      addMesh(group, new THREE.BoxGeometry(0.42, 0.04, 0.22), cap, [0, headY - 0.02, 0.16]);
      break;
    }
    case "headband":
      addMesh(group, new THREE.TorusGeometry(0.31, 0.035, 8, 24), mat(0xe63946), [0, headY + 0.02, 0], [Math.PI / 2, 0, 0]);
      break;
    case "fro":
      addMesh(group, new THREE.SphereGeometry(0.42, 18, 18), dark, [0, headY + 0.12, 0]);
      break;
    case "crown": {
      const gold = mat(0xffb703, { metalness: 0.55, roughness: 0.35 });
      for (let i = 0; i < 5; i++) {
        const a = -0.5 + i * 0.25;
        addMesh(group, new THREE.ConeGeometry(0.06, 0.16, 4), gold, [a, headY + 0.34, 0]);
      }
      addMesh(group, new THREE.CylinderGeometry(0.32, 0.34, 0.08, 16), gold, [0, headY + 0.24, 0]);
      break;
    }
    case "buzz":
    default:
      addMesh(group, new THREE.SphereGeometry(0.33, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), dark, [0, headY + 0.02, 0]);
      break;
  }
}

function buildFace(group, faceId) {
  const eye = mat(0x1a120c);
  const headY = 0.52;

  const addEyes = () => {
    addMesh(group, new THREE.SphereGeometry(0.035, 8, 8), eye, [-0.11, headY + 0.02, 0.28]);
    addMesh(group, new THREE.SphereGeometry(0.035, 8, 8), eye, [0.11, headY + 0.02, 0.28]);
  };

  switch (faceId) {
    case "grin":
      addEyes();
      addMesh(group, new THREE.TorusGeometry(0.09, 0.018, 6, 12, Math.PI), mat(0x5c3d2e), [0, headY - 0.1, 0.27], [0, 0, Math.PI]);
      break;
    case "cool":
      addMesh(group, new THREE.BoxGeometry(0.34, 0.08, 0.05), mat(0x111111), [0, headY + 0.03, 0.31]);
      addMesh(group, new THREE.BoxGeometry(0.14, 0.05, 0.04), mat(0x111111), [0, headY + 0.03, 0.33]);
      break;
    case "star": {
      const star = mat(0xffd166, { emissive: 0xffb703, emissiveIntensity: 0.35 });
      addMesh(group, new THREE.OctahedronGeometry(0.06, 0), star, [-0.11, headY + 0.02, 0.3], [0, 0, Math.PI / 4]);
      addMesh(group, new THREE.OctahedronGeometry(0.06, 0), star, [0.11, headY + 0.02, 0.3], [0, 0, Math.PI / 4]);
      addMesh(group, new THREE.BoxGeometry(0.08, 0.02, 0.02), mat(0x5c3d2e), [0, headY - 0.08, 0.28]);
      break;
    }
    case "focus":
      addMesh(group, new THREE.SphereGeometry(0.035, 8, 8), eye, [0.11, headY + 0.02, 0.28]);
      addMesh(group, new THREE.TorusGeometry(0.07, 0.012, 6, 16), mat(0xadb5bd), [-0.11, headY + 0.02, 0.3], [0, 0, 0]);
      addMesh(group, new THREE.CylinderGeometry(0.015, 0.015, 0.14, 8), mat(0xadb5bd), [-0.24, headY + 0.02, 0.28], [0, 0, Math.PI / 2]);
      addMesh(group, new THREE.BoxGeometry(0.08, 0.02, 0.02), mat(0x5c3d2e), [0, headY - 0.08, 0.28]);
      break;
    case "fire": {
      addEyes();
      addMesh(group, new THREE.SphereGeometry(0.055, 8, 8), mat(0xff6b35, { emissive: 0xff4500, emissiveIntensity: 0.8 }), [-0.18, headY - 0.02, 0.22]);
      addMesh(group, new THREE.SphereGeometry(0.045, 8, 8), mat(0xff9f1c, { emissive: 0xff8500, emissiveIntensity: 0.6 }), [0.2, headY + 0.08, 0.18]);
      addMesh(group, new THREE.BoxGeometry(0.12, 0.02, 0.02), mat(0x5c3d2e), [0, headY - 0.08, 0.28]);
      break;
    }
    case "goat":
      addEyes();
      addMesh(group, new THREE.ConeGeometry(0.04, 0.12, 4), mat(0xd4d4d4), [-0.14, headY + 0.28, 0.05], [0, 0, -0.4]);
      addMesh(group, new THREE.ConeGeometry(0.04, 0.12, 4), mat(0xd4d4d4), [0.14, headY + 0.28, 0.05], [0, 0, 0.4]);
      addMesh(group, new THREE.BoxGeometry(0.1, 0.02, 0.02), mat(0x5c3d2e), [0, headY - 0.08, 0.28]);
      break;
    case "classic":
    default:
      addEyes();
      addMesh(group, new THREE.BoxGeometry(0.1, 0.02, 0.02), mat(0x5c3d2e), [0, headY - 0.08, 0.28]);
      break;
  }
}

function buildClothes(group, clothesId, tint) {
  const color = new THREE.Color(tint || "#e85d04");
  const fabric = mat(color);
  const trim = mat(0xffffff, { roughness: 0.5 });

  switch (clothesId) {
    case "warmup": {
      addMesh(group, new THREE.BoxGeometry(0.78, 0.62, 0.42), fabric, [0, -0.02, 0]);
      addMesh(group, new THREE.BoxGeometry(0.82, 0.18, 0.44), fabric, [0, 0.28, 0], [-0.25, 0, 0]);
      break;
    }
    case "retro":
      addMesh(group, new THREE.BoxGeometry(0.72, 0.58, 0.38), fabric, [0, -0.08, 0]);
      addMesh(group, new THREE.BoxGeometry(0.74, 0.08, 0.39), trim, [0, 0.18, 0.01]);
      break;
    case "throwback":
      addMesh(group, new THREE.BoxGeometry(0.62, 0.52, 0.34), fabric, [0, -0.1, 0]);
      break;
    case "city":
      addMesh(group, new THREE.BoxGeometry(0.68, 0.54, 0.36), fabric, [0, -0.08, 0]);
      addMesh(group, new THREE.BoxGeometry(0.7, 0.12, 0.02), trim, [0, 0.02, 0.19]);
      break;
    case "finals": {
      const suit = mat(0x1b1b1e);
      const shirt = mat(0xf8f9fa);
      addMesh(group, new THREE.BoxGeometry(0.7, 0.58, 0.38), suit, [0, -0.08, 0]);
      addMesh(group, new THREE.BoxGeometry(0.22, 0.36, 0.02), shirt, [0, 0.02, 0.2]);
      addMesh(group, new THREE.BoxGeometry(0.08, 0.2, 0.03), mat(0xe63946), [0, -0.02, 0.21]);
      break;
    }
    case "champ": {
      addMesh(group, new THREE.BoxGeometry(0.74, 0.58, 0.4), fabric, [0, -0.06, 0]);
      addMesh(group, new THREE.BoxGeometry(0.76, 0.06, 0.41), mat(0xffd166, { metalness: 0.4 }), [0, 0.18, 0.01]);
      addMesh(group, new THREE.BoxGeometry(0.76, 0.06, 0.41), mat(0xffd166, { metalness: 0.4 }), [0, -0.26, 0.01]);
      break;
    }
    case "jersey":
    default:
      addMesh(group, new THREE.BoxGeometry(0.74, 0.58, 0.4), fabric, [0, -0.06, 0]);
      addMesh(group, new THREE.BoxGeometry(0.16, 0.22, 0.02), trim, [0, 0.08, 0.21]);
      break;
  }
}

export function buildAvatarGroup(profile = {}) {
  const sel = avatarSelection(profile);
  const clothes = findAvatarItem("clothes", sel.clothes);
  const group = new THREE.Group();

  buildClothes(group, sel.clothes, clothes.tint);
  addMesh(group, new THREE.CylinderGeometry(0.12, 0.14, 0.12, 12), mat(SKIN), [0, 0.28, 0]);
  addMesh(group, new THREE.SphereGeometry(0.34, 24, 24), mat(SKIN), [0, 0.52, 0]);
  buildHair(group, sel.hair);
  buildFace(group, sel.face);

  group.position.y = -0.08;
  return group;
}

function sizePx(size) {
  if (size === "hero") return 240;
  if (size === "lg") return 96;
  if (size === "sm") return 56;
  return 80;
}

function setupDrag(group, domElement) {
  let dragging = false;
  let lastX = 0;

  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    domElement.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!dragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    group.rotation.y += (x - lastX) * 0.012;
    lastX = x;
  };
  const onUp = () => {
    dragging = false;
    domElement.style.cursor = "grab";
  };

  domElement.style.cursor = "grab";
  domElement.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  return () => {
    domElement.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
}

export function disposeAvatar3D(container) {
  const entry = mounts.get(container);
  if (!entry) return;
  entry.stop?.();
  entry.cleanupDrag?.();
  entry.observer?.disconnect();
  entry.renderer.dispose();
  container.innerHTML = "";
  mounts.delete(container);
}

export function mountAvatar3D(container, profile, { size = "lg", autoRotate = true, interactive = false } = {}) {
  if (!container) return false;

  disposeAvatar3D(container);

  try {
    const px = sizePx(size);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(0, 0.18, 2.35);
    camera.lookAt(0, 0.15, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(px, px);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "avatar-3d-canvas";
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.05);
    key.position.set(1.2, 2.2, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6ea8fe, 0.35);
    rim.position.set(-2, 0.5, -1);
    scene.add(rim);

    const avatar = buildAvatarGroup(profile);
    scene.add(avatar);

    let frameId = 0;
    let alive = true;
    let visible = true;
    const animate = () => {
      if (!alive) return;
      frameId = requestAnimationFrame(animate);
      if (!visible) return;
      if (autoRotate) avatar.rotation.y += interactive ? 0.003 : 0.008;
      renderer.render(scene, camera);
    };
    animate();

    const cleanupDrag = interactive ? setupDrag(avatar, renderer.domElement) : null;

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    mounts.set(container, {
      renderer,
      scene,
      camera,
      avatar,
      frameId,
      cleanupDrag,
      observer,
      profileKey: avatarKey(profile),
      stop: () => {
        alive = false;
        cancelAnimationFrame(frameId);
      },
    });
    return true;
  } catch {
    return false;
  }
}

function avatarKey(profile) {
  const sel = avatarSelection(profile);
  return `${sel.face}|${sel.hair}|${sel.clothes}`;
}

export function refreshAvatar3D(container, profile, options) {
  const entry = mounts.get(container);
  const key = avatarKey(profile);
  if (entry?.profileKey === key) return true;
  return mountAvatar3D(container, profile, options);
}
