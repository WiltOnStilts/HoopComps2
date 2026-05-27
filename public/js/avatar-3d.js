/** 3D collector avatar — modular Face + Torso parts */

import * as THREE from "https://esm.sh/three@0.170.0";
import { avatarSelection, findAvatarItem, skinHex, eyeColorHex, eyebrowColorHex, hairColorHex, AVATAR_PART_KEYS } from "./avatar-catalog.js";

const mounts = new WeakMap();
const HEAD_Y = 0.52;

/** Single shared WebGL context for shop thumbnails — avoids browser context limits */
let thumbRenderer = null;
let thumbScene = null;
let thumbCamera = null;
let thumbAvatar = null;
const thumbCache = new Map();

function disposeObject3D(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

function clearThumbAvatar() {
  if (!thumbAvatar || !thumbScene) return;
  disposeObject3D(thumbAvatar);
  thumbScene.remove(thumbAvatar);
  thumbAvatar = null;
}

function ensureThumbRenderer(size) {
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    thumbScene = new THREE.Scene();
    thumbCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    thumbCamera.position.set(0, 0.18, 2.35);
    thumbCamera.lookAt(0, 0.15, 0);
    thumbScene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.05);
    key.position.set(1.2, 2.2, 2.5);
    thumbScene.add(key);
    const rim = new THREE.DirectionalLight(0x6ea8fe, 0.35);
    rim.position.set(-2, 0.5, -1);
    thumbScene.add(rim);
  }
  thumbRenderer.setSize(size, size);
  thumbRenderer.setPixelRatio(1);
  return thumbRenderer;
}

export async function captureAvatarThumbnail(profile, size = 88) {
  const cacheKey = `${size}:${avatarKey(profile)}`;
  if (thumbCache.has(cacheKey)) return thumbCache.get(cacheKey);

  try {
    const renderer = ensureThumbRenderer(size);
    clearThumbAvatar();
    thumbAvatar = buildAvatarGroup(profile);
    thumbAvatar.rotation.y = Math.PI / 6;
    thumbScene.add(thumbAvatar);
    renderer.render(thumbScene, thumbCamera);
    const url = renderer.domElement.toDataURL("image/png");
    thumbCache.set(cacheKey, url);
    clearThumbAvatar();
    return url;
  } catch {
    clearThumbAvatar();
    return null;
  }
}

export function disposeAvatarThumbnailRenderer() {
  thumbCache.clear();
  clearThumbAvatar();
  if (thumbRenderer) {
    thumbRenderer.dispose();
    thumbRenderer = null;
  }
  thumbScene = null;
  thumbCamera = null;
}

function mat(color, opts = {}) {
  const c = typeof color === "string" ? new THREE.Color(color) : color;
  return new THREE.MeshStandardMaterial({
    color: c,
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

function buildEars(group, skinMat) {
  addMesh(group, new THREE.SphereGeometry(0.07, 10, 10), skinMat, [-0.33, HEAD_Y, 0.02], [0, 0, 0.2]);
  addMesh(group, new THREE.SphereGeometry(0.07, 10, 10), skinMat, [0.33, HEAD_Y, 0.02], [0, 0, -0.2]);
}

function buildEyebrows(group, browsId, colorHex) {
  const brow = mat(parseInt(String(colorHex).replace("#", ""), 16) || 0x2b2118);
  const y = HEAD_Y + 0.12;
  const z = 0.29;

  switch (browsId) {
    case "thick":
      addMesh(group, new THREE.BoxGeometry(0.16, 0.035, 0.02), brow, [-0.11, y, z]);
      addMesh(group, new THREE.BoxGeometry(0.16, 0.035, 0.02), brow, [0.11, y, z]);
      break;
    case "arched":
      addMesh(group, new THREE.BoxGeometry(0.14, 0.02, 0.02), brow, [-0.11, y + 0.02, z], [0, 0, 0.35]);
      addMesh(group, new THREE.BoxGeometry(0.14, 0.02, 0.02), brow, [0.11, y + 0.02, z], [0, 0, -0.35]);
      break;
    case "flat":
      addMesh(group, new THREE.BoxGeometry(0.14, 0.018, 0.02), brow, [-0.11, y, z]);
      addMesh(group, new THREE.BoxGeometry(0.14, 0.018, 0.02), brow, [0.11, y, z]);
      break;
    case "bushy":
      addMesh(group, new THREE.BoxGeometry(0.18, 0.05, 0.025), brow, [-0.11, y, z]);
      addMesh(group, new THREE.BoxGeometry(0.18, 0.05, 0.025), brow, [0.11, y, z]);
      break;
    case "raised":
      addMesh(group, new THREE.BoxGeometry(0.12, 0.02, 0.02), brow, [-0.11, y + 0.04, z], [0, 0, 0.5]);
      addMesh(group, new THREE.BoxGeometry(0.12, 0.02, 0.02), brow, [0.11, y + 0.04, z], [0, 0, -0.5]);
      break;
    case "natural":
    default:
      addMesh(group, new THREE.BoxGeometry(0.13, 0.022, 0.02), brow, [-0.11, y + 0.01, z], [0, 0, 0.15]);
      addMesh(group, new THREE.BoxGeometry(0.13, 0.022, 0.02), brow, [0.11, y + 0.01, z], [0, 0, -0.15]);
      break;
  }
}

function buildEyes(group, eyesId, colorHex) {
  const eye = mat(parseInt(String(colorHex).replace("#", ""), 16) || 0x1a120c);
  const white = mat(0xf8f9fa);
  const y = HEAD_Y + 0.02;
  const z = 0.28;

  const addRoundEyes = (rx = 0.035, ry = 0.035) => {
    addMesh(group, new THREE.SphereGeometry(rx, 8, 8), white, [-0.11, y, z], [0, 0, 0], [1, ry / rx, 1]);
    addMesh(group, new THREE.SphereGeometry(rx, 8, 8), white, [0.11, y, z], [0, 0, 0], [1, ry / rx, 1]);
    addMesh(group, new THREE.SphereGeometry(rx * 0.55, 8, 8), eye, [-0.11, y, z + 0.02]);
    addMesh(group, new THREE.SphereGeometry(rx * 0.55, 8, 8), eye, [0.11, y, z + 0.02]);
  };

  switch (eyesId) {
    case "narrow":
      addRoundEyes(0.04, 0.022);
      break;
    case "wide":
      addRoundEyes(0.05, 0.045);
      break;
    case "intense":
      addRoundEyes(0.032, 0.032);
      addMesh(group, new THREE.BoxGeometry(0.14, 0.018, 0.02), eye, [-0.11, y + 0.05, z + 0.01], [0, 0, 0.2]);
      addMesh(group, new THREE.BoxGeometry(0.14, 0.018, 0.02), eye, [0.11, y + 0.05, z + 0.01], [0, 0, -0.2]);
      break;
    case "sleepy":
      addRoundEyes(0.034, 0.028);
      addMesh(group, new THREE.BoxGeometry(0.15, 0.025, 0.02), mat(0xc68642), [-0.11, y + 0.04, z + 0.01], [0, 0, -0.25]);
      addMesh(group, new THREE.BoxGeometry(0.15, 0.025, 0.02), mat(0xc68642), [0.11, y + 0.04, z + 0.01], [0, 0, 0.25]);
      break;
    case "star": {
      const star = mat(0xffd166, { emissive: 0xffb703, emissiveIntensity: 0.35 });
      addMesh(group, new THREE.OctahedronGeometry(0.06, 0), star, [-0.11, y, z + 0.02], [0, 0, Math.PI / 4]);
      addMesh(group, new THREE.OctahedronGeometry(0.06, 0), star, [0.11, y, z + 0.02], [0, 0, Math.PI / 4]);
      break;
    }
    case "shade":
      addMesh(group, new THREE.BoxGeometry(0.36, 0.09, 0.05), mat(0x111111), [0, y + 0.01, z + 0.03]);
      addMesh(group, new THREE.BoxGeometry(0.15, 0.05, 0.04), mat(0x111111), [0, y + 0.01, z + 0.04]);
      break;
    case "round":
    default:
      addRoundEyes();
      break;
  }
}

function buildHair(group, hairId, colorHex) {
  if (!hairId || hairId === "bald") return;

  const hair = mat(parseInt(String(colorHex).replace("#", ""), 16) || 0x2b2118);
  const topY = HEAD_Y + 0.08;

  switch (hairId) {
    case "buzzcut":
      addMesh(
        group,
        new THREE.SphereGeometry(0.33, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
        hair,
        [0, topY, 0]
      );
      break;
    case "crew":
      addMesh(
        group,
        new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
        hair,
        [0, topY - 0.02, -0.03]
      );
      break;
    case "fade":
      addMesh(
        group,
        new THREE.SphereGeometry(0.33, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
        hair,
        [0, topY, 0.02]
      );
      addMesh(group, new THREE.BoxGeometry(0.36, 0.08, 0.12), hair, [0, topY - 0.06, -0.08], [0.25, 0, 0]);
      break;
    case "sidepart":
      addMesh(
        group,
        new THREE.SphereGeometry(0.35, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hair,
        [0.04, topY, 0]
      );
      addMesh(group, new THREE.BoxGeometry(0.18, 0.04, 0.14), hair, [-0.14, topY + 0.04, 0.06], [0, 0, 0.35]);
      break;
    case "wavy":
      addMesh(group, new THREE.SphereGeometry(0.36, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hair, [0, topY + 0.02, 0]);
      addMesh(group, new THREE.SphereGeometry(0.12, 10, 10), hair, [-0.22, topY, 0.04]);
      addMesh(group, new THREE.SphereGeometry(0.12, 10, 10), hair, [0.22, topY, 0.04]);
      break;
    case "curly":
      for (const [x, z, s] of [
        [0, 0.04, 0.14],
        [-0.16, 0.02, 0.11],
        [0.16, 0.02, 0.11],
        [-0.08, 0.1, 0.1],
        [0.08, 0.1, 0.1],
      ]) {
        addMesh(group, new THREE.SphereGeometry(s, 10, 10), hair, [x, topY + 0.06, z]);
      }
      break;
    case "afro":
      addMesh(group, new THREE.SphereGeometry(0.42, 14, 14), hair, [0, topY + 0.1, 0]);
      break;
    case "long":
      addMesh(group, new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, [0, topY + 0.02, 0]);
      addMesh(group, new THREE.BoxGeometry(0.34, 0.28, 0.14), hair, [0, topY - 0.18, -0.06]);
      addMesh(group, new THREE.BoxGeometry(0.1, 0.22, 0.08), hair, [-0.2, topY - 0.12, 0.02]);
      addMesh(group, new THREE.BoxGeometry(0.1, 0.22, 0.08), hair, [0.2, topY - 0.12, 0.02]);
      break;
    case "fluffy":
      addMesh(group, new THREE.SphereGeometry(0.4, 12, 12), hair, [0, topY + 0.12, 0]);
      addMesh(group, new THREE.SphereGeometry(0.22, 10, 10), hair, [-0.22, topY + 0.08, 0.06]);
      addMesh(group, new THREE.SphereGeometry(0.22, 10, 10), hair, [0.22, topY + 0.08, 0.06]);
      addMesh(group, new THREE.SphereGeometry(0.18, 10, 10), hair, [0, topY + 0.22, -0.02]);
      addMesh(group, new THREE.SphereGeometry(0.14, 8, 8), hair, [-0.1, topY + 0.18, 0.12]);
      addMesh(group, new THREE.SphereGeometry(0.14, 8, 8), hair, [0.1, topY + 0.18, 0.12]);
      break;
    default:
      break;
  }
}

function buildNose(group, noseId, skinMat) {
  const y = HEAD_Y - 0.02;
  const z = 0.31;

  switch (noseId) {
    case "button":
      addMesh(group, new THREE.SphereGeometry(0.045, 10, 10), skinMat, [0, y, z]);
      break;
    case "straight":
      addMesh(group, new THREE.BoxGeometry(0.05, 0.12, 0.06), skinMat, [0, y, z]);
      break;
    case "wide":
      addMesh(group, new THREE.BoxGeometry(0.1, 0.06, 0.07), skinMat, [0, y, z]);
      break;
    case "sharp":
      addMesh(group, new THREE.ConeGeometry(0.05, 0.14, 4), skinMat, [0, y, z], [0.2, 0, 0]);
      break;
    case "classic":
    default:
      addMesh(group, new THREE.SphereGeometry(0.04, 8, 8), skinMat, [0, y, z]);
      addMesh(group, new THREE.BoxGeometry(0.06, 0.05, 0.04), skinMat, [0, y - 0.03, z - 0.01]);
      break;
  }
}

function buildMouth(group, mouthId) {
  const lip = mat(0x5c3d2e);
  const y = HEAD_Y - 0.12;
  const z = 0.28;

  switch (mouthId) {
    case "grin":
      addMesh(group, new THREE.TorusGeometry(0.1, 0.018, 6, 12, Math.PI), lip, [0, y, z], [0, 0, Math.PI]);
      break;
    case "smirk":
      addMesh(group, new THREE.TorusGeometry(0.07, 0.015, 6, 10, Math.PI * 0.65), lip, [0.02, y, z], [0, 0, Math.PI + 0.35]);
      break;
    case "flat":
      addMesh(group, new THREE.BoxGeometry(0.1, 0.015, 0.02), lip, [0, y, z]);
      break;
    case "open":
      addMesh(group, new THREE.SphereGeometry(0.055, 10, 10, 0, Math.PI * 2, 0, Math.PI), mat(0x3d1515), [0, y, z], [Math.PI, 0, 0]);
      break;
    case "laugh":
      addMesh(group, new THREE.TorusGeometry(0.11, 0.02, 6, 12, Math.PI * 1.15), lip, [0, y, z], [0, 0, Math.PI]);
      break;
    case "tough":
      addMesh(group, new THREE.BoxGeometry(0.11, 0.02, 0.02), lip, [0, y, z]);
      addMesh(group, new THREE.BoxGeometry(0.04, 0.03, 0.02), lip, [-0.05, y - 0.01, z]);
      break;
    case "smile":
    default:
      addMesh(group, new THREE.TorusGeometry(0.08, 0.015, 6, 12, Math.PI), lip, [0, y, z], [0, 0, Math.PI]);
      break;
  }
}

function buildArms(group, buildId, fabric) {
  const specs = {
    slim: { radius: 0.07, length: 0.42, x: 0.46 },
    average: { radius: 0.09, length: 0.44, x: 0.48 },
    athletic: { radius: 0.1, length: 0.46, x: 0.5 },
    strong: { radius: 0.12, length: 0.48, x: 0.52 },
    powerhouse: { radius: 0.14, length: 0.5, x: 0.54 },
  };
  const spec = specs[buildId] || specs.average;
  const armY = 0.02;

  addMesh(
    group,
    new THREE.CylinderGeometry(spec.radius, spec.radius * 0.92, spec.length, 10),
    fabric,
    [-spec.x, armY, 0],
    [0, 0, 0.35]
  );
  addMesh(
    group,
    new THREE.CylinderGeometry(spec.radius, spec.radius * 0.92, spec.length, 10),
    fabric,
    [spec.x, armY, 0],
    [0, 0, -0.35]
  );
}

function buildTorsoBase(group, buildId, fabric) {
  const specs = {
    slim: { w: 0.62, h: 0.52, d: 0.34 },
    average: { w: 0.72, h: 0.56, d: 0.38 },
    athletic: { w: 0.76, h: 0.58, d: 0.4 },
    strong: { w: 0.82, h: 0.6, d: 0.42 },
    powerhouse: { w: 0.9, h: 0.62, d: 0.44 },
  };
  const spec = specs[buildId] || specs.average;
  addMesh(group, new THREE.BoxGeometry(spec.w, spec.h, spec.d), fabric, [0, -0.08, 0]);
  buildArms(group, buildId, fabric);
}

function buildCostume(group, costumeId, tint, buildId) {
  const color = new THREE.Color(tint || "#e85d04");
  const fabric = mat(color);
  const trim = mat(0xffffff, { roughness: 0.5 });
  const dark = mat(0x1b1b1e);
  const neon = mat(0xffc300);
  const gold = mat(0xffd166, { metalness: 0.4, roughness: 0.35 });

  buildTorsoBase(group, buildId, fabric);

  switch (costumeId) {
    case "garbage": {
      const vest = mat(0xffc300);
      addMesh(group, new THREE.BoxGeometry(0.78, 0.62, 0.02), vest, [0, -0.02, 0.2]);
      addMesh(group, new THREE.BoxGeometry(0.12, 0.12, 0.03), dark, [-0.18, 0.08, 0.22]);
      addMesh(group, new THREE.BoxGeometry(0.12, 0.12, 0.03), dark, [0.18, 0.08, 0.22]);
      addMesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8), neon, [0.28, 0.12, 0.15], [0, 0, Math.PI / 2]);
      break;
    }
    case "fastfood":
      addMesh(group, new THREE.BoxGeometry(0.74, 0.28, 0.02), mat(0xffffff), [0, -0.02, 0.2]);
      addMesh(group, new THREE.BoxGeometry(0.36, 0.08, 0.12), fabric, [0, 0.34, 0.02]);
      break;
    case "retail":
      addMesh(group, new THREE.BoxGeometry(0.74, 0.08, 0.39), trim, [0, 0.18, 0.01]);
      addMesh(group, new THREE.BoxGeometry(0.12, 0.06, 0.02), mat(0xffd166), [0.14, 0.04, 0.21]);
      break;
    case "intern":
      addMesh(group, new THREE.BoxGeometry(0.22, 0.36, 0.02), mat(0xf8f9fa), [0, 0.02, 0.2]);
      addMesh(group, new THREE.BoxGeometry(0.04, 0.22, 0.02), mat(0xe63946), [-0.06, -0.02, 0.21]);
      break;
    case "teacher":
      addMesh(group, new THREE.BoxGeometry(0.76, 0.14, 0.41), mat(0xf4a261), [0, 0.12, 0.01]);
      addMesh(group, new THREE.BoxGeometry(0.16, 0.22, 0.02), trim, [0, 0.08, 0.21]);
      break;
    case "coach_hs":
      addMesh(group, new THREE.BoxGeometry(0.7, 0.12, 0.02), trim, [0, 0.02, 0.19]);
      addMesh(group, new THREE.BoxGeometry(0.16, 0.22, 0.02), trim, [0, 0.08, 0.21]);
      addMesh(group, new THREE.TorusGeometry(0.04, 0.012, 6, 12), mat(0xf8f9fa), [0.22, 0.02, 0.18], [Math.PI / 2, 0, 0]);
      break;
    case "trainer":
      addMesh(group, new THREE.BoxGeometry(0.82, 0.18, 0.44), fabric, [0, 0.28, 0], [-0.25, 0, 0]);
      addMesh(group, new THREE.BoxGeometry(0.76, 0.06, 0.41), trim, [0, 0.18, 0.01]);
      break;
    case "scout":
      addMesh(group, new THREE.BoxGeometry(0.68, 0.54, 0.36), mat(0x495057), [0, -0.08, 0]);
      addMesh(group, new THREE.BoxGeometry(0.14, 0.18, 0.04), mat(0xf8f9fa), [0.24, 0.02, 0.16], [0, -0.4, 0.2]);
      break;
    case "analyst": {
      const shirt = mat(0xf8f9fa);
      addMesh(group, new THREE.BoxGeometry(0.22, 0.36, 0.02), shirt, [0, 0.02, 0.2]);
      addMesh(group, new THREE.BoxGeometry(0.08, 0.2, 0.03), mat(0xe63946), [0, -0.02, 0.21]);
      break;
    }
    case "broadcaster":
      addMesh(group, new THREE.BoxGeometry(0.22, 0.36, 0.02), mat(0xf8f9fa), [0, 0.02, 0.2]);
      addMesh(group, new THREE.SphereGeometry(0.05, 8, 8), mat(0x111111), [0.2, 0.06, 0.2]);
      addMesh(group, new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), mat(0x111111), [0.2, -0.02, 0.2]);
      break;
    case "gleague":
      addMesh(group, new THREE.BoxGeometry(0.82, 0.18, 0.44), fabric, [0, 0.28, 0], [-0.25, 0, 0]);
      addMesh(group, new THREE.BoxGeometry(0.76, 0.06, 0.41), trim, [0, -0.26, 0.01]);
      break;
    case "rookie":
      addMesh(group, new THREE.BoxGeometry(0.16, 0.22, 0.02), trim, [0, 0.08, 0.21]);
      addMesh(group, new THREE.BoxGeometry(0.08, 0.1, 0.02), mat(0xffffff), [-0.04, 0.02, 0.22]);
      break;
    case "allstar":
      addMesh(group, new THREE.BoxGeometry(0.76, 0.06, 0.41), gold, [0, 0.18, 0.01]);
      addMesh(group, new THREE.OctahedronGeometry(0.05, 0), mat(0xffffff, { emissive: 0xffd166, emissiveIntensity: 0.25 }), [0, 0.08, 0.22]);
      break;
    case "nba_star":
      addMesh(group, new THREE.BoxGeometry(0.16, 0.22, 0.02), trim, [0, 0.08, 0.21]);
      addMesh(group, new THREE.BoxGeometry(0.76, 0.06, 0.41), gold, [0, 0.18, 0.01]);
      addMesh(group, new THREE.BoxGeometry(0.76, 0.06, 0.41), gold, [0, -0.26, 0.01]);
      addMesh(group, new THREE.OctahedronGeometry(0.045, 0), gold, [0, 0.08, 0.23], [0, 0, Math.PI / 4]);
      break;
    default: {
      const vest = mat(0xffc300);
      addMesh(group, new THREE.BoxGeometry(0.78, 0.62, 0.02), vest, [0, -0.02, 0.2]);
      break;
    }
  }
}

export function buildAvatarGroup(profile = {}) {
  const sel = avatarSelection(profile);
  const costume = findAvatarItem("costume", sel.costume);
  const group = new THREE.Group();
  const skinColor = skinHex(profile);
  const skinMat = mat(skinColor);

  buildCostume(group, sel.costume, costume.tint, sel.build);
  addMesh(group, new THREE.CylinderGeometry(0.12, 0.14, 0.12, 12), skinMat, [0, 0.28, 0]);
  addMesh(group, new THREE.SphereGeometry(0.34, 24, 24), skinMat, [0, HEAD_Y, 0]);
  buildEars(group, skinMat);
  buildEyebrows(group, sel.eyebrows, eyebrowColorHex(profile));
  buildEyes(group, sel.eyes, eyeColorHex(profile));
  buildNose(group, sel.nose, skinMat);
  buildMouth(group, sel.mouth);
  buildHair(group, sel.hair, hairColorHex(profile));

  group.position.y = -0.08;
  return group;
}

function sizePx(size) {
  if (size === "hero") return 240;
  if (size === "thumb") return 88;
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
  if (entry.avatar) disposeObject3D(entry.avatar);
  entry.renderer.dispose();
  entry.renderer.forceContextLoss?.();
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
  return AVATAR_PART_KEYS.map((key) => sel[key]).join("|");
}

export function refreshAvatar3D(container, profile, options) {
  const entry = mounts.get(container);
  const key = avatarKey(profile);
  if (entry?.profileKey === key) return true;
  return mountAvatar3D(container, profile, options);
}
