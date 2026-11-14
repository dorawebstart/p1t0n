/**
 * Глобальний Жар-календар вогню — Сторінковий скрол + 3D Orbital & Architectural Visualizations
 * Команда P1t0n — NASA Space Apps Challenge 2026
 */

const API_BASE = window.location.hostname === 'localhost' && window.location.port !== '8000'
  ? 'http://localhost:8000/api'
  : '/api';

const GLOBAL_REGIONS = {
  "Ukraine (Україна)": { center: [48.3794, 31.1656], zoom: 6 },
  "Amazon Basin (Амазонія)": { center: [-3.4653, -62.2159], zoom: 5 },
  "California (Каліфорнія, США)": { center: [36.7783, -119.4179], zoom: 6 },
  "Siberia (Сибір, РФ)": { center: [60.0, 100.0], zoom: 4 },
  "Mediterranean (Середземномор'я)": { center: [38.0, 20.0], zoom: 5 },
  "Australia (Австралія)": { center: [-25.2744, 133.7751], zoom: 5 },
  "Central Africa (Центральна Африка)": { center: [0.0, 20.0], zoom: 5 }
};

const MONTHS_UA = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

const state = {
  region: 'Ukraine (Україна)',
  fromYear: 2000,
  toYear: 2026,
  selectedMonth: '2024-08',
  sensor: 'harmonized',
  mapMode: 'markers',
  anomaliesOnly: false,
  calendarData: [],
  currentFires: [],
  isBackendLive: false
};

let map;
let firesLayerGroup;

document.addEventListener('DOMContentLoaded', async () => {
  init3DSpaceBackground();
  initSpotlightCards();
  initScrollSpy();
  initMap();
  bindEvents();
  
  // Ініціалізація ексклюзивних 3D моделей для секції 4
  initArchitecture3DModels();

  await loadRegions();
  await loadMetrics();
  await refreshDashboard();
});

/* Скрол-спай для підсвічування кнопок навігації при скролі */
function initScrollSpy() {
  const sections = document.querySelectorAll('.site-section');
  const navTabs = document.querySelectorAll('.nav-tab');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(sec => {
      const secTop = sec.offsetTop;
      const secHeight = sec.clientHeight;
      if (window.scrollY >= (secTop - 250)) {
        current = sec.getAttribute('id');
      }
    });

    navTabs.forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-target') === current) {
        tab.classList.add('active');
      }
    });
  });
}

function init3DSpaceBackground() {
  const canvas = document.getElementById('globe-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 16;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const earthGroup = new THREE.Group();
  earthGroup.position.set(4.8, 0.6, -1.5);
  scene.add(earthGroup);

  const sphereGeo = new THREE.SphereGeometry(5.3, 44, 44);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0xff5e2b,
    wireframe: true,
    transparent: true,
    opacity: 0.09
  });
  const wireSphere = new THREE.Mesh(sphereGeo, wireMat);
  earthGroup.add(wireSphere);

  const dotsCount = 2000;
  const dotsGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(dotsCount * 3);
  const colors = new Float32Array(dotsCount * 3);

  const colorOrange = new THREE.Color(0xff5e2b);
  const colorAmber = new THREE.Color(0xffb703);
  const colorSlate = new THREE.Color(0x475569);

  for (let i = 0; i < dotsCount; i++) {
    const phi = Math.acos(-1 + (2 * i) / dotsCount);
    const theta = Math.sqrt(dotsCount * Math.PI) * phi;
    const r = 5.33;

    positions[i * 3] = r * Math.cos(theta) * Math.sin(phi);
    positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const rand = Math.random();
    const c = rand > 0.91 ? colorAmber : rand > 0.77 ? colorOrange : colorSlate;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  dotsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dotsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const dotsMat = new THREE.PointsMaterial({
    size: 0.068,
    vertexColors: true,
    transparent: true,
    opacity: 0.9
  });
  const globePoints = new THREE.Points(dotsGeo, dotsMat);
  earthGroup.add(globePoints);

  const createOrbitRing = (radius, colorHex, tiltX, tiltY) => {
    const ringGeo = new THREE.RingGeometry(radius - 0.02, radius + 0.02, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = tiltX;
    ring.rotation.y = tiltY;
    earthGroup.add(ring);
  };

  createOrbitRing(6.4, 0xff5e2b, Math.PI / 2.4, 0.3);
  createOrbitRing(6.9, 0x38bdf8, Math.PI / 1.8, -0.4);

  const satGroup = new THREE.Group();
  const satBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.25),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  const satWing = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.02, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  satGroup.add(satBody, satWing);
  earthGroup.add(satGroup);

  let targetMouseX = 0;
  let targetMouseY = 0;
  window.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 0.5;
    targetMouseY = (e.clientY / window.innerHeight - 0.5) * 0.5;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (window.innerWidth < 768) {
      earthGroup.position.set(0, 1.8, -5);
    } else {
      earthGroup.position.set(4.8, 0.6, -1.5);
    }
  });

  if (window.innerWidth < 768) {
    earthGroup.position.set(0, 1.8, -5);
  }

  let angle = 0;
  function animate() {
    requestAnimationFrame(animate);
    angle += 0.006;

    earthGroup.rotation.y += 0.0018;
    earthGroup.rotation.x += (targetMouseY * 0.3 - earthGroup.rotation.x) * 0.05;
    earthGroup.rotation.z += (-targetMouseX * 0.2 - earthGroup.rotation.z) * 0.05;

    satGroup.position.x = Math.cos(angle * 2.2) * 6.9;
    satGroup.position.z = Math.sin(angle * 2.2) * 6.9;
    satGroup.position.y = Math.sin(angle * 2.2) * 2.4;
    satGroup.lookAt(earthGroup.position);

    renderer.render(scene, camera);
  }

  animate();
}

/* Ініціалізація ексклюзивних 3D-моделей для архітектури (Секція 4) */
function initArchitecture3DModels() {
  if (typeof THREE === 'undefined') return;

  // 1. Супутник №1 (Орбітальний сканер)
  initMini3DScene('model-sat-1', (scene) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.6, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xff5e2b, wireframe: true })
    );
    const dish = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.6, 16),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true })
    );
    dish.position.set(0, -0.6, 0);
    dish.rotation.x = Math.PI;
    group.add(body, dish);
    scene.add(group);
    return group;
  });

  // 2. Супутник №2 (Високодетальна оптика)
  initMini3DScene('model-sat-2', (scene) => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.4, 16),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true })
    );
    const panelL = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.05, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xff9e44, wireframe: true })
    );
    panelL.position.set(1.4, 0, 0);
    const panelR = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.05, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xff9e44, wireframe: true })
    );
    panelR.position.set(-1.4, 0, 0);
    group.add(core, panelL, panelR);
    scene.add(group);
    return group;
  });

  // 3. Нейромережева матриця обробки
  initMini3DScene('model-processing', (scene) => {
    const group = new THREE.Group();
    const ico = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.4, 1),
      new THREE.MeshBasicMaterial({ color: 0xff5e2b, wireframe: true })
    );
    const innerCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.8, 0),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true })
    );
    group.add(ico, innerCore);
    scene.add(group);
    return group;
  });

  // 4. Планетарний глобус карти
  initMini3DScene('model-globe-arch', (scene) => {
    const group = new THREE.Group();
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xff9e44, wireframe: true })
    );
    const orbit = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.15, 64),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    orbit.rotation.x = Math.PI / 2.5;
    group.add(globe, orbit);
    scene.add(group);
    return group;
  });
}

function initMini3DScene(containerId, setupFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.z = 4.5;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const obj = setupFn(scene);

  function animate() {
    requestAnimationFrame(animate);
    if (obj) {
      obj.rotation.y += 0.007;
      obj.rotation.x += 0.003;
    }
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
}

function initSpotlightCards() {
  document.querySelectorAll('.spotlight-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

function initMap() {
  map = L.map('map', {
    center: [20.0, 0.0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap | NASA FIRMS Global',
    maxZoom: 18,
    className: 'dark-map-tiles'
  }).addTo(map);

  firesLayerGroup = L.layerGroup().addTo(map);
}

function bindEvents() {
  document.getElementById('region-select').addEventListener('change', async (e) => {
    state.region = e.target.value;
    const regInfo = GLOBAL_REGIONS[state.region] || { center: [20.0, 0.0], zoom: 3 };
    map.flyTo(regInfo.center, regInfo.zoom, { duration: 1.1 });
    await refreshDashboard();
  });

  const updateYears = async () => {
    let from = parseInt(document.getElementById('year-from').value, 10) || 2000;
    let to = parseInt(document.getElementById('year-to').value, 10) || 2026;
    from = Math.max(2000, Math.min(2026, from));
    to = Math.max(from, Math.min(2026, to));
    state.fromYear = from;
    state.toYear = to;
    await loadCalendar();
  };
  document.getElementById('year-from').addEventListener('change', updateYears);
  document.getElementById('year-to').addEventListener('change', updateYears);

  document.querySelectorAll('#sensor-toggle .seg-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#sensor-toggle .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sensor = btn.dataset.sensor;
      renderHeatmap();
      await loadFires();
    });
  });

  document.querySelectorAll('#map-mode-toggle .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#map-mode-toggle .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mapMode = btn.dataset.mode;
      renderFiresOnMap();
    });
  });

  document.getElementById('toggle-anomalies-only').addEventListener('change', (e) => {
    state.anomaliesOnly = e.target.checked;
    renderHeatmap();
  });

  document.getElementById('btn-go-coord').addEventListener('click', () => {
    const raw = document.getElementById('coord-input').value.trim();
    const parts = raw.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      map.flyTo([parts[0], parts[1]], 8, { duration: 0.9 });
    } else {
      alert('Введіть координати у форматі: 50.45, 30.52');
    }
  });

  document.getElementById('btn-export-csv').addEventListener('click', exportCurrentFiresToCSV);
}

function setApiStatus(isLive) {
  state.isBackendLive = isLive;
  const badge = document.getElementById('api-status-badge');
  const textEl = badge.querySelector('.status-text');
  if (isLive) {
    badge.className = 'status-pill status-live';
    textEl.textContent = 'API Підключено';
  } else {
    badge.className = 'status-pill status-demo';
    textEl.textContent = 'Симуляція API';
  }
}

async function loadRegions() {
  let regions = Object.keys(GLOBAL_REGIONS);
  try {
    const res = await fetch(`${API_BASE}/regions`);
    if (!res.ok) throw new Error('API offline');
    const backendRegions = await res.json();
    if (backendRegions && backendRegions.length) {
      regions = backendRegions;
    }
    setApiStatus(true);
  } catch {
    setApiStatus(false);
  }

  const select = document.getElementById('region-select');
  select.innerHTML = '';
  regions.forEach(reg => {
    const opt = document.createElement('option');
    opt.value = reg;
    opt.textContent = reg;
    if (reg === state.region) opt.selected = true;
    select.appendChild(opt);
  });
}

async function loadMetrics() {
  let metrics;
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    if (!res.ok) throw new Error('API offline');
    metrics = await res.json();
  } catch {
    metrics = {
      mae: "18.5 точок/міс",
      r2: "0.91",
      notes: "Глобальна регресійна модель калібрування VIIRS та MODIS (2012–2021 рр.). Враховує екосистемні коефіцієнти для лісів, саван та сільгоспугідь."
    };
  }

  document.getElementById('metric-mae').textContent = metrics.mae;
  document.getElementById('metric-r2').textContent = metrics.r2;
  document.getElementById('metric-notes').textContent = metrics.notes;
}

async function refreshDashboard() {
  await loadCalendar();
  await loadFires();
}

async function loadCalendar() {
  const encodedRegion = encodeURIComponent(state.region);
  try {
    const res = await fetch(`${API_BASE}/calendar?region=${encodedRegion}&from=${state.fromYear}&to=${state.toYear}`);
    if (!res.ok) throw new Error('API offline');
    state.calendarData = await res.json();
    setApiStatus(true);
  } catch {
    state.calendarData = generateMockCalendar(state.region, state.fromYear, state.toYear);
    setApiStatus(false);
  }

  renderHeatmap();
  updateInspectorAndComparison();
}

async function loadFires() {
  const encodedRegion = encodeURIComponent(state.region);
  try {
    const res = await fetch(`${API_BASE}/fires?region=${encodedRegion}&month=${state.selectedMonth}&sensor=${state.sensor}`);
    if (!res.ok) throw new Error('API offline');
    state.currentFires = await res.json();
  } catch {
    state.currentFires = generateMockFires(state.region, state.selectedMonth, state.sensor);
  }

  renderFiresOnMap();
  updateInspectorAndComparison();
}

function renderHeatmap() {
  const container = document.getElementById('heatmap-grid');
  container.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'hm-header-cell';
  corner.textContent = 'Рік';
  container.appendChild(corner);

  MONTHS_UA.forEach(m => {
    const th = document.createElement('div');
    th.className = 'hm-header-cell';
    th.textContent = m;
    container.appendChild(th);
  });

  const getVal = (row) => {
    if (state.sensor === 'MODIS') return row.modis_count ?? 0;
    if (state.sensor === 'VIIRS') return row.viirs_count ?? 0;
    return row.harmonized_count ?? 0;
  };

  const maxVal = Math.max(1, ...state.calendarData.map(getVal));
  const tooltip = document.getElementById('heatmap-tooltip');

  for (let y = state.toYear; y >= state.fromYear; y--) {
    const yearLabel = document.createElement('div');
    yearLabel.className = 'hm-year-label';
    yearLabel.textContent = y;
    container.appendChild(yearLabel);

    for (let m = 1; m <= 12; m++) {
      const row = state.calendarData.find(d => d.year === y && d.month === m);
      const cell = document.createElement('div');
      cell.className = 'hm-cell';

      const monthStr = `${y}-${String(m).padStart(2, '0')}`;
      if (monthStr === state.selectedMonth) cell.classList.add('selected');

      if (!row) {
        cell.style.background = 'rgba(255,255,255,0.02)';
      } else {
        const val = getVal(row);
        const ratio = Math.min(1, val / maxVal);
        cell.style.background = getFireColor(ratio);

        const isAnomaly = (row.anomaly ?? 0) > 2.0;
        if (isAnomaly) cell.classList.add('anomaly');
        if (state.anomaliesOnly && !isAnomaly) cell.classList.add('dimmed');

        cell.addEventListener('mousemove', (e) => {
          tooltip.classList.remove('hidden');
          tooltip.style.left = `${e.clientX + 14}px`;
          tooltip.style.top = `${e.clientY + 14}px`;
          tooltip.innerHTML = `
            <strong>${MONTHS_UA[m - 1]} ${y}</strong> (${state.region})<br/>
            Harmonized: <b>${row.harmonized_count}</b><br/>
            MODIS: ${row.modis_count ?? 'н/д'} | VIIRS: ${row.viirs_count ?? 'н/д'}<br/>
            Z-score: <span style="color:${isAnomaly ? '#fde047' : '#9ca3af'}">${(row.anomaly ?? 0).toFixed(2)}</span>
          `;
        });

        cell.addEventListener('mouseleave', () => {
          tooltip.classList.add('hidden');
        });

        cell.addEventListener('click', async () => {
          state.selectedMonth = monthStr;
          renderHeatmap();
          await loadFires();
        });
      }

      container.appendChild(cell);
    }
  }
}

function getFireColor(ratio) {
  if (ratio <= 0.02) return '#16181f';
  if (ratio < 0.25) return '#431407';
  if (ratio < 0.50) return '#9a3412';
  if (ratio < 0.75) return '#ea580c';
  if (ratio < 0.90) return '#f97316';
  return '#fde047';
}

function renderFiresOnMap() {
  firesLayerGroup.clearLayers();

  const regInfo = GLOBAL_REGIONS[state.region] || { center: [50.45, 30.52] };
  const baseLat = regInfo.center[0];
  const baseLon = regInfo.center[1];

  state.currentFires.forEach(pt => {
    const frp = pt.frp || 20;
    const color = frp > 80 ? '#ef4444' : frp >= 25 ? '#f97316' : '#fbbf24';
    const radius = state.mapMode === 'clusters'
      ? Math.min(26, Math.max(10, frp / 4))
      : Math.min(10, Math.max(4, frp / 12));

    const lat = pt.lat ?? (baseLat + (Math.random() - 0.5) * 6);
    const lon = pt.lon ?? (baseLon + (Math.random() - 0.5) * 8);

    const marker = L.circleMarker([lat, lon], {
      radius,
      fillColor: color,
      color: state.mapMode === 'clusters' ? 'transparent' : '#fff',
      weight: 0.7,
      opacity: 0.9,
      fillOpacity: state.mapMode === 'clusters' ? 0.35 : 0.85
    });

    marker.bindPopup(`
      <div style="font-family: Inter, sans-serif; color: #111;">
        <strong>Глобальне вогнище (${pt.sensor})</strong><br/>
        Регіон: ${state.region}<br/>
        Дата: ${pt.date}<br/>
        Потужність (FRP): <b>${frp.toFixed(1)} МВт</b><br/>
        Координати: ${lat.toFixed(4)}, ${lon.toFixed(4)}
      </div>
    `);

    marker.addTo(firesLayerGroup);
  });
}

function updateInspectorAndComparison() {
  const [yStr, mStr] = state.selectedMonth.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);

  const row = state.calendarData.find(d => d.year === y && d.month === m) || {
    modis_count: 140,
    viirs_count: 380,
    harmonized_count: 365,
    anomaly: 1.5
  };

  document.getElementById('kpi-period').textContent = state.selectedMonth;
  document.getElementById('kpi-region-name').textContent = state.region;
  document.getElementById('kpi-hotspots').textContent = row.harmonized_count;
  
  const zVal = (row.anomaly ?? 0).toFixed(2);
  const kpiAnom = document.getElementById('kpi-anomaly');
  kpiAnom.textContent = `${zVal > 0 ? '+' : ''}${zVal}σ`;
  kpiAnom.style.color = row.anomaly > 2.0 ? '#fde047' : '#f8fafc';
  document.getElementById('kpi-anomaly-desc').textContent =
    row.anomaly > 2.0 ? 'Критична аномалія регіону' : 'У межах сезонної норми';

  document.getElementById('comp-month-label').textContent = state.selectedMonth;
  const modis = row.modis_count ?? 0;
  const viirs = row.viirs_count ?? 0;
  const harm = row.harmonized_count ?? 0;
  const maxBar = Math.max(1, modis, viirs, harm);

  document.getElementById('bar-modis').style.width = `${(modis / maxBar) * 100}%`;
  document.getElementById('val-modis').textContent = modis;

  document.getElementById('bar-viirs').style.width = `${(viirs / maxBar) * 100}%`;
  document.getElementById('val-viirs').textContent = viirs;

  document.getElementById('bar-harm').style.width = `${(harm / maxBar) * 100}%`;
  document.getElementById('val-harm').textContent = harm;

  document.getElementById('insp-date').textContent = `${MONTHS_UA[m - 1]} ${y} (${state.region})`;
  document.getElementById('insp-summary').textContent = row.anomaly > 2.0
    ? `Зафіксовано значну глобальну аномалію (Z = ${zVal}). Кількість гармонізованих точок (${harm}) значно вища за середню норму.`
    : `Пожежна активність (${harm} гармонізованих точок) у регіоні стабільна (Z = ${zVal}).`;
}

function exportCurrentFiresToCSV() {
  if (!state.currentFires.length) {
    alert('Немає даних для експорту за обраний період.');
    return;
  }

  const headers = ['region', 'month', 'date', 'lat', 'lon', 'frp', 'sensor'];
  const rows = state.currentFires.map(f => [
    `"${state.region}"`,
    state.selectedMonth,
    f.date,
    f.lat || 0,
    f.lon || 0,
    f.frp,
    f.sensor
  ].join(','));

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `P1t0n_global_fires_${state.region.replace(/[^a-zA-Z0-9]/g, '_')}_${state.selectedMonth}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function generateMockCalendar(region, fromYear, toYear) {
  const data = [];
  const seedOffset = region.length * 11;

  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const peakSeason = (m >= 7 && m <= 9) ? 220 : 60;
      const pseudoRand = Math.abs(Math.sin(y * 17 + m * 5 + seedOffset));
      const baseModis = Math.round((peakSeason + 40) * (0.5 + pseudoRand));
      
      const viirs = y >= 2012 ? Math.round(baseModis * (2.6 + pseudoRand * 0.3)) : null;
      const harmonized = y >= 2012 ? viirs : Math.round(baseModis * 2.75);
      
      let anomaly = (pseudoRand - 0.45) * 3.4;
      if ((y === 2023 && m === 8) || (y === 2019 && m === 9) || (y === 2024 && m === 7)) {
        anomaly = 2.75;
      }

      data.push({
        region,
        year: y,
        month: m,
        modis_count: baseModis,
        viirs_count: viirs,
        harmonized_count: harmonized,
        anomaly: Number(anomaly.toFixed(2))
      });
    }
  }
  return data;
}

function generateMockFires(region, monthStr, sensor) {
  const regInfo = GLOBAL_REGIONS[region] || { center: [20.0, 0.0] };
  const center = regInfo.center;
  const count = sensor === 'MODIS' ? 35 : 85;
  const points = [];

  for (let i = 0; i < count; i++) {
    const angle = (i * 137.5) * (Math.PI / 180);
    const dist = 0.5 + ((i % 15) * 0.4);
    const day = String((i % 28) + 1).padStart(2, '0');
    
    points.push({
      lat: center[0] + Math.sin(angle) * dist * 1.5,
      lon: center[1] + Math.cos(angle) * dist * 2.0,
      frp: Number((15 + ((i * 23) % 130)).toFixed(1)),
      sensor: sensor === 'harmonized' ? (i % 3 === 0 ? 'MODIS (cal)' : 'VIIRS') : sensor,
      date: `${monthStr}-${day}`
    });
  }
  return points;
}