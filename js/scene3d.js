// three.js "dollhouse" view of the room, plus GLB export for AR.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFurniture } from './models.js';
import { wallInfo, doorInfo } from './fengshui.js';

export class RoomView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 25;

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a66', 1.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    this.roomGroup = new THREE.Group();
    this.furnitureGroup = new THREE.Group();
    this.scene.add(this.roomGroup, this.furnitureGroup);
    this.visible = false;
    this.framedFor = '';

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.visible) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  setVisible(v) {
    this.visible = v;
    if (v) this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setTheme(dark) {
    this.scene.background = new THREE.Color(dark ? '#14161b' : '#eef0f3');
  }

  update(room, placed) {
    const key = `${room.width}x${room.depth}x${room.height}`;
    disposeChildren(this.roomGroup);
    this.roomGroup.add(buildRoom(room));
    disposeChildren(this.furnitureGroup, false);
    for (const p of placed) this.furnitureGroup.add(placeFurniture(p, room));

    const span = Math.max(room.width, room.depth);
    const s = this.sun.shadow.camera;
    s.left = s.bottom = -span; s.right = s.top = span; s.near = 0.5; s.far = 30;
    s.updateProjectionMatrix();
    this.sun.position.set(span * 0.6, 7, span * 0.9);
    this.sun.target.position.set(0, 0, 0);

    if (this.framedFor !== key) {
      this.framedFor = key;
      this.camera.position.set(room.width * 0.75, Math.max(room.width, room.depth) * 1.15, room.depth * 1.25);
      this.controls.target.set(0, 0.4, 0);
      this.controls.update();
    }
  }
}

function disposeChildren(group, disposeMaterials = true) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (disposeMaterials && o.material && !o.material.userData.shared) o.material.dispose();
    });
  }
}

function placeFurniture(p, room) {
  const g = buildFurniture(p.type, p.tier);
  g.position.set(p.x - room.width / 2, 0, p.z - room.depth / 2);
  g.rotation.y = (p.rot * Math.PI) / 2;
  g.userData.key = p.key;
  return g;
}

/** Floor, inward-facing walls (cut away from the camera), door and windows. */
function buildRoom(room) {
  const g = new THREE.Group();
  const { width: W, depth: D, height: H } = room;
  const floorMat = new THREE.MeshStandardMaterial({ color: '#d8c3a2', roughness: 0.8 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), floorMat);
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  g.add(floor);
  // Plank lines
  const lineMat = new THREE.MeshBasicMaterial({ color: '#c4ad8b' });
  for (let x = -W / 2 + 0.18; x < W / 2; x += 0.18) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.006, D), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(x, 0.001, 0);
    g.add(l);
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.95, side: THREE.FrontSide });
  const walls = { N: [W, 0, -D / 2, 0], S: [W, 0, D / 2, Math.PI], W: [D, -W / 2, 0, Math.PI / 2], E: [D, W / 2, 0, -Math.PI / 2] };
  for (const [name, [len, x, z, ry]] of Object.entries(walls)) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat);
    wall.position.set(x, H / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    wall.name = 'wall-' + name;
    g.add(wall);
    // Skirting board
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    skirt.position.set(x, 0.04, z);
    skirt.rotation.y = ry;
    skirt.translateZ(0.003);
    g.add(skirt);
  }

  const opening = (wall, offset, width, bottom, height, color, frame) => {
    const info = wallInfo(room, wall, offset);
    const rot = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }[wall];
    const mk = (w, h, c, dz) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
      m.position.set(info.p[0] - W / 2, bottom + height / 2, info.p[1] - D / 2);
      m.rotation.y = rot;
      m.translateZ(dz);
      g.add(m);
      return m;
    };
    mk(width + 0.1, height + 0.08, frame, 0.004);
    mk(width, height, color, 0.008);
  };
  const door = doorInfo(room);
  opening(room.door.wall, room.door.offset, door.width, 0, 2.05, '#b08a63', '#ffffff');
  for (const w of room.windows) opening(w.wall, w.offset, w.width, 0.9, Math.min(1.3, H - 1.1), '#bcd9ee', '#ffffff');
  return g;
}

/* ---------------- AR export ---------------- */

/** Scene for AR: furniture plus a thin outline of the room on the floor, centred at the origin. */
export function buildArScene(room, placed) {
  const g = new THREE.Group();
  for (const p of placed) g.add(placeFurniture(p, room));
  const lineMat = new THREE.MeshStandardMaterial({ color: '#6d86ff', roughness: 0.5 });
  const t = 0.03, y = 0.003;
  const strips = [
    [room.width, t, 0, -room.depth / 2], [room.width, t, 0, room.depth / 2],
    [t, room.depth, -room.width / 2, 0], [t, room.depth, room.width / 2, 0],
  ];
  for (const [w, d, x, z] of strips) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, d), lineMat);
    m.position.set(x, y, z);
    g.add(m);
  }
  const door = doorInfo(room);
  const dm = new THREE.Mesh(new THREE.BoxGeometry(door.t[0] ? door.width : 0.1, 0.008, door.t[0] ? 0.1 : door.width),
    new THREE.MeshStandardMaterial({ color: '#35d07f' }));
  dm.position.set(door.p[0] - room.width / 2 + door.n[0] * 0.05, 0.004, door.p[1] - room.depth / 2 + door.n[1] * 0.05);
  g.add(dm);
  return g;
}

export function singleItemScene(type, tier) {
  const g = new THREE.Group();
  g.add(buildFurniture(type, tier));
  return g;
}

export function exportGLB(object) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(object, (buf) => resolve(new Blob([buf], { type: 'model/gltf-binary' })), reject, { binary: true });
  });
}
