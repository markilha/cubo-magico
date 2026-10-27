import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import "./style.css";

const canvas = document.querySelector("#cube-canvas");
const experience = document.querySelector(".experience");
const hint = document.querySelector("#interaction-hint");
const undoButton = document.querySelector("#undo");
const resetButton = document.querySelector("#reset");
const shuffleButton = document.querySelector("#shuffle");
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const toast = document.querySelector("#toast");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#deddd7");

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(7.2, 6.2, 8.4);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new TrackballControls(camera, canvas);
controls.noPan = true;
controls.staticMoving = false;
controls.dynamicDampingFactor = 0.08;
controls.rotateSpeed = 3;
controls.minDistance = 8;
controls.maxDistance = 18;
controls.target.set(0, 0, 0);

scene.add(new THREE.HemisphereLight("#ffffff", "#86847c", 2.1));

const keyLight = new THREE.DirectionalLight("#fffdf4", 4.4);
keyLight.position.set(-4, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 25;
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 7;
keyLight.shadow.camera.bottom = -7;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight("#d9fff0", 2.4);
rimLight.position.set(6, 2, -5);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.ShadowMaterial({ color: "#4d4b45", opacity: 0.16 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.05;
floor.receiveShadow = true;
scene.add(floor);

const cubeRoot = new THREE.Group();
cubeRoot.rotation.y = -0.22;
scene.add(cubeRoot);

const CUBIE_SIZE = 1.82;
const GAP = 0.12;
const SPACING = CUBIE_SIZE + GAP;
const STICKER_SIZE = 1.57;
const BODY_COLOR = "#171816";

const faceColors = {
  px: "#13b866",
  nx: "#176fe8",
  py: "#f13b43",
  ny: "#ffd128",
  pz: "#f7f7f2",
  nz: "#ff7a1a",
};

const bodyGeometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 5, 0.18);
const stickerGeometry = new RoundedBoxGeometry(STICKER_SIZE, STICKER_SIZE, 0.055, 4, 0.13);
const bodyMaterial = new THREE.MeshStandardMaterial({
  color: BODY_COLOR,
  roughness: 0.38,
  metalness: 0.02,
});
const stickerMaterials = Object.fromEntries(
  Object.entries(faceColors).map(([face, color]) => [
    face,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.32,
      metalness: 0,
    }),
  ]),
);

const cubies = [];
const interactiveMeshes = [];

function addSticker(cubie, face, position, rotation) {
  const sticker = new THREE.Mesh(stickerGeometry, stickerMaterials[face]);
  sticker.position.copy(position);
  sticker.rotation.set(...rotation);
  sticker.castShadow = true;
  sticker.receiveShadow = true;
  sticker.userData.cubie = cubie;
  sticker.userData.face = face;
  cubie.add(sticker);
  interactiveMeshes.push(sticker);
}

for (let x = -1; x <= 1; x += 1) {
  for (let y = -1; y <= 1; y += 1) {
    for (let z = -1; z <= 1; z += 1) {
      const cubie = new THREE.Group();
      cubie.position.set(x * SPACING, y * SPACING, z * SPACING);
      cubie.userData.coord = new THREE.Vector3(x, y, z);
      cubie.userData.initialCoord = new THREE.Vector3(x, y, z);

      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.cubie = cubie;
      cubie.add(body);
      interactiveMeshes.push(body);

      const offset = CUBIE_SIZE / 2 + 0.035;
      if (x === 1) addSticker(cubie, "px", new THREE.Vector3(offset, 0, 0), [0, Math.PI / 2, 0]);
      if (x === -1) addSticker(cubie, "nx", new THREE.Vector3(-offset, 0, 0), [0, -Math.PI / 2, 0]);
      if (y === 1) addSticker(cubie, "py", new THREE.Vector3(0, offset, 0), [-Math.PI / 2, 0, 0]);
      if (y === -1) addSticker(cubie, "ny", new THREE.Vector3(0, -offset, 0), [Math.PI / 2, 0, 0]);
      if (z === 1) addSticker(cubie, "pz", new THREE.Vector3(0, 0, offset), [0, 0, 0]);
      if (z === -1) addSticker(cubie, "nz", new THREE.Vector3(0, 0, -offset), [0, Math.PI, 0]);

      cubeRoot.add(cubie);
      cubies.push(cubie);
    }
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const rotationGroup = new THREE.Group();
cubeRoot.add(rotationGroup);

let mode = "explore";
let pointerStart = null;
let activeHit = null;
let rotating = false;
let moveHistory = [];
let toastTimer;
let autoRotate = true;
let previousFrameTime = 0;

function updateButtons() {
  undoButton.disabled = rotating || moveHistory.length === 0;
  resetButton.disabled = rotating || moveHistory.length === 0;
  shuffleButton.disabled = rotating;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1300);
}

function zoomCamera(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(
    offset.length() * factor,
    controls.minDistance,
    controls.maxDistance,
  );
  camera.position.copy(controls.target).add(offset.setLength(distance));
  controls.update();
}

zoomInButton.addEventListener("click", () => zoomCamera(0.8));
zoomOutButton.addEventListener("click", () => zoomCamera(1.25));

function setMode(nextMode) {
  mode = nextMode;
  controls.enabled = mode === "explore";
  canvas.style.cursor = mode === "solve" ? "crosshair" : "grab";
  hint.textContent =
    mode === "explore"
      ? "Arraste para girar · role para aproximar"
      : "Arraste uma peça na direção do giro desejado";

  document.querySelectorAll(".mode-button").forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

function getPointerHit(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(interactiveMeshes, false)[0] ?? null;
}

function worldFaceNormal(hit) {
  const normal = hit.face.normal.clone();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  return normal.applyMatrix3(normalMatrix).normalize();
}

function dominantAxis(vector) {
  const values = [Math.abs(vector.x), Math.abs(vector.y), Math.abs(vector.z)];
  const index = values.indexOf(Math.max(...values));
  return ["x", "y", "z"][index];
}

function resolveSwipeMove(event) {
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  if (Math.hypot(dx, dy) < 18) return null;

  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const dragDirection = cameraRight.multiplyScalar(dx).add(cameraUp.multiplyScalar(-dy));
  const faceNormal = worldFaceNormal(activeHit);
  const cubeRotation = cubeRoot.getWorldQuaternion(new THREE.Quaternion());
  dragDirection.addScaledVector(faceNormal, -dragDirection.dot(faceNormal));
  if (dragDirection.lengthSq() < 1e-6) return null;

  const cubeCenter = cubeRoot.getWorldPosition(new THREE.Vector3());
  const radial = activeHit.point.clone().sub(cubeCenter);
  const localRotationAxis = new THREE.Vector3()
    .crossVectors(radial, dragDirection)
    .applyQuaternion(cubeRotation.invert());
  if (localRotationAxis.lengthSq() < 1e-6) return null;

  const axis = dominantAxis(localRotationAxis);
  const cubie = activeHit.object.userData.cubie;
  const layer = Math.round(cubie.userData.coord[axis]);
  const direction = Math.sign(localRotationAxis[axis]) || 1;
  return { axis, layer, direction };
}

canvas.addEventListener("pointerdown", (event) => {
  autoRotate = false;
  if (mode !== "solve" || rotating) return;

  const hit = getPointerHit(event);
  if (!hit) return;
  activeHit = hit;
  pointerStart = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerStart || !activeHit || rotating) return;
  const move = resolveSwipeMove(event);
  if (!move) return;

  pointerStart = null;
  activeHit = null;
  rotateLayer(move.axis, move.layer, move.direction, true);
});

canvas.addEventListener("pointerup", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  pointerStart = null;
  activeHit = null;
});

canvas.addEventListener("pointercancel", () => {
  pointerStart = null;
  activeHit = null;
});

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function rotateCoord(coord, axis, direction) {
  const matrix = new THREE.Matrix4();
  const axisVector = new THREE.Vector3(
    axis === "x" ? 1 : 0,
    axis === "y" ? 1 : 0,
    axis === "z" ? 1 : 0,
  );
  matrix.makeRotationAxis(axisVector, direction * Math.PI / 2);
  coord.applyMatrix4(matrix);
  coord.set(Math.round(coord.x), Math.round(coord.y), Math.round(coord.z));
}

function rotateLayer(axis, layer, direction, record = true, duration = 280) {
  if (rotating) return Promise.resolve();
  rotating = true;
  updateButtons();

  const layerCubies = cubies.filter(
    (cubie) => Math.round(cubie.userData.coord[axis]) === layer,
  );
  layerCubies.forEach((cubie) => rotationGroup.attach(cubie));

  const start = performance.now();
  const targetAngle = direction * Math.PI / 2;

  return new Promise((resolve) => {
    function animateRotation(now) {
      const progress = Math.min((now - start) / duration, 1);
      rotationGroup.rotation[axis] = targetAngle * easeInOutCubic(progress);

      if (progress < 1) {
        requestAnimationFrame(animateRotation);
        return;
      }

      rotationGroup.updateMatrixWorld(true);
      layerCubies.forEach((cubie) => {
        cubeRoot.attach(cubie);
        rotateCoord(cubie.userData.coord, axis, direction);
        cubie.position.copy(cubie.userData.coord).multiplyScalar(SPACING);
      });
      rotationGroup.rotation.set(0, 0, 0);

      if (record) moveHistory.push({ axis, layer, direction });
      rotating = false;
      updateButtons();
      resolve();
    }

    requestAnimationFrame(animateRotation);
  });
}

shuffleButton.addEventListener("click", async () => {
  if (rotating) return;
  const axes = ["x", "y", "z"];
  let previous = "";
  for (let index = 0; index < 14; index += 1) {
    let axis;
    do axis = axes[Math.floor(Math.random() * axes.length)];
    while (axis === previous);
    previous = axis;
    const layer = [-1, 0, 1][Math.floor(Math.random() * 3)];
    const direction = Math.random() > 0.5 ? 1 : -1;
    await rotateLayer(axis, layer, direction, true, 90);
  }
  showToast("Cubo embaralhado");
});

undoButton.addEventListener("click", async () => {
  if (rotating || moveHistory.length === 0) return;
  const move = moveHistory.pop();
  await rotateLayer(move.axis, move.layer, -move.direction, false);
});

resetButton.addEventListener("click", () => {
  if (rotating) return;
  cubies.forEach((cubie) => {
    cubeRoot.attach(cubie);
    cubie.userData.coord.copy(cubie.userData.initialCoord);
    cubie.position.copy(cubie.userData.initialCoord).multiplyScalar(SPACING);
    cubie.quaternion.identity();
  });
  moveHistory = [];
  updateButtons();
  showToast("Cubo reiniciado");
});

function resize() {
  const width = experience.clientWidth;
  const height = experience.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(experience);
resize();
updateButtons();

function render() {
  const now = performance.now();
  const delta = previousFrameTime ? Math.min((now - previousFrameTime) / 1000, 0.05) : 0;
  previousFrameTime = now;
  if (autoRotate && mode === "explore") {
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      delta * 0.0576,
    );
    camera.position.sub(controls.target).applyQuaternion(rotation).add(controls.target);
    camera.up.applyQuaternion(rotation);
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
