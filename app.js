/* =====  CONFIG  ===== */
// When running locally: python app.py → http://localhost:5000
// When deployed on Render: the same origin serves everything
const API = '';   // empty string = same-origin (works both local & Render)
let _token = localStorage.getItem('nx_token') || '';

/* ===== API HELPERS ===== */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return res.json();
}

/* ===== LIVE DATA (loaded from server) ===== */
let rooms    = [];
let bookings = [];
let currentUser  = null;
let selectedRoomForModal = null;
let bookingCounter = parseInt(localStorage.getItem('hb_counter') || '520');
let editingBookingId = null;

async function loadRooms() {
  const data = await api('GET', '/api/rooms');
  rooms.length = 0;
  (Array.isArray(data) ? data : []).forEach(r => rooms.push(r));
}

async function loadBookings() {
  const data = await api('GET', '/api/bookings');
  bookings.length = 0;
  (Array.isArray(data) ? data : []).forEach(b => bookings.push(b));
}

// Legacy stubs — kept so existing code calling them won't break
function saveUsers()    {}
function saveBookings() {}
function saveRooms()    {}

/* ===== AUTH ===== */
function showAuth(page) {
  document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
}

function togglePw(id, btn) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.innerHTML = el.type === 'password' ? '<i class="bx bx-show"></i>' : '<i class="bx bx-hide"></i>';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-pw').value;
  const err   = document.getElementById('login-error');
  err.classList.add('hidden');
  if (!email || !pw) { showErr(err, 'Please fill in all fields.'); return; }
  const res = await api('POST', '/api/login', { email, pw });
  if (res.error) { showErr(err, res.error); return; }
  // Block admin accounts from the user portal — they must use /admin
  if (res.user && res.user.role === 'Admin') {
    showErr(err, 'This is the Guest Portal. Admin accounts must sign in at the Admin Portal (/admin).');
    return;
  }
  _token = res.token;
  localStorage.setItem('nx_token', _token);
  currentUser = res.user;
  await startApp();
}

async function doRegister() {
  const fn   = document.getElementById('reg-fname').value.trim();
  const ln   = document.getElementById('reg-lname').value.trim();
  const email= document.getElementById('reg-email').value.trim();
  const phone= document.getElementById('reg-phone').value.trim();
  const pw   = document.getElementById('reg-pw').value;
  const cpw  = document.getElementById('reg-cpw').value;
  const err  = document.getElementById('reg-error');
  err.classList.add('hidden');
  if (!fn || !ln || !email || !phone || !pw) { showErr(err, 'Please fill in all required fields.'); return; }
  if (pw.length < 6) { showErr(err, 'Password must be at least 6 characters.'); return; }
  if (pw !== cpw)    { showErr(err, 'Passwords do not match.'); return; }
  const res = await api('POST', '/api/register', { fname: fn, lname: ln, email, phone, pw });
  if (res.error) { showErr(err, res.error); return; }
  _token = res.token;
  localStorage.setItem('nx_token', _token);
  currentUser = res.user;
  await startApp();
}

function showErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

function doLogout() {
  currentUser = null;
  _token = '';
  localStorage.removeItem('nx_token');
  document.getElementById('app-section').classList.add('hidden');
  document.getElementById('auth-section').style.display = '';
  showAuth('login');
  toast('Logged out successfully.', 'success');
}

function isAdmin() {
  return currentUser && (currentUser.role === 'Admin' || currentUser.email === 'sofia@email.com' || currentUser.email === 'jeriel@gmail.com');
}

async function startApp() {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('app-section').classList.remove('hidden');
  // Load data from Python server
  await loadRooms();
  await loadBookings();
  updateSidebarUser();
  applyRoleNav();
  renderRooms();
  syncBookingRoomSelect();
  if (isAdmin()) {
    renderAllBookings();
    renderDashboard();
    showPage('dashboard');
  } else {
    renderMyBookings();
    showPage('browse');
  }
}

function applyRoleNav() {
  const admin = isAdmin();
  // Show/hide admin-only nav items
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = admin ? '' : 'none');
  // Show/hide user-only nav items
  document.querySelectorAll('.user-only').forEach(el => el.style.display = admin ? 'none' : '');
  // Update role badge in sidebar
  const roleEl = document.getElementById('sidebar-role');
  if (roleEl) {
    roleEl.textContent = admin ? 'Admin' : 'Guest';
    roleEl.style.color = admin ? 'var(--gold)' : 'var(--text-muted)';
  }
}

function updateSidebarUser() {
  if (!currentUser) return;
  const initials = (currentUser.fname[0] + (currentUser.lname[0] || '')).toUpperCase();
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('sidebar-name').textContent = currentUser.fname + ' ' + currentUser.lname;
  document.getElementById('sidebar-role').textContent = currentUser.role;
  document.getElementById('topbar-username').textContent = currentUser.fname;
  loadSettings();
}

/* ===== NAVIGATION ===== */
function showPage(p) {
  // Role guard — regular users cannot see admin pages
  if (!isAdmin() && (p === 'dashboard' || p === 'allbookings')) {
    toast('Access restricted to Admin only.', 'error'); return;
  }
  // Admin redirected from mybookings → allbookings
  if (isAdmin() && p === 'mybookings') {
    p = 'allbookings';
  }
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + p);
  if (pg) pg.classList.add('active');
  const nav = document.getElementById('nav-' + p);
  if (nav) nav.classList.add('active');
  const labels = { dashboard: 'Dashboard', browse: 'Browse Rooms', newbooking: 'New Booking', allbookings: 'All Bookings', mybookings: 'My Bookings', settings: 'Settings', confirmation: 'Booking Confirmed' };
  document.getElementById('topbar-page').textContent = labels[p] || p;
  if (p === 'dashboard') renderDashboard();
  if (p === 'browse') renderRooms();
  if (p === 'allbookings') renderAllBookings();
  if (p === 'mybookings') renderMyBookings();
  if (p === 'newbooking') prefillBookingForm();
  if (p === 'settings') loadSettings();
  window.scrollTo(0, 0);
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const validBookings = bookings.filter(b => b.status === 'Confirmed' || b.status === 'Completed');
  const pending = bookings.filter(b => b.status === 'Pending');
  const revenue = validBookings.reduce((s, b) => s + b.total, 0);
  const avail = rooms.filter(r => r.status === 'Available').length;
  animateCount('stat-revenue', revenue, '₱');
  animateCount('stat-confirmed', validBookings.length);
  animateCount('stat-available', avail);
  animateCount('stat-pending', pending.length);
  const statAvailEl = document.getElementById('stat-available-sub');
  if (statAvailEl) statAvailEl.textContent = `of ${rooms.length} total rooms`;
  // Calendar
  calRender();
  // Room status summary
  const avR = rooms.filter(r => r.status === 'Available').length;
  const occR = rooms.filter(r => r.status === 'Occupied').length;
  const mntR = rooms.filter(r => r.status === 'Maintenance').length;
  document.getElementById('room-status-list').innerHTML = `
    <div class="status-row"><span><span class="status-dot" style="background:#00c9a7"></span>Available</span><strong>${avR}</strong></div>
    <div class="status-row"><span><span class="status-dot" style="background:#f7b731"></span>Occupied</span><strong>${occR}</strong></div>
    <div class="status-row"><span><span class="status-dot" style="background:#fd9644"></span>Maintenance</span><strong>${mntR}</strong></div>`;

  // Revenue Breakdown
  let revToday = 0, revWeek = 0, revMonth = 0, revYear = 0;
  const todayDate = new Date();
  const startOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const startOfYear = new Date(todayDate.getFullYear(), 0, 1);

  validBookings.forEach(b => {
    const d = b.created_at ? new Date(b.created_at) : new Date(b.checkin);
    if (d >= startOfDay) revToday += b.total;
    if (d >= startOfWeek) revWeek += b.total;
    if (d >= startOfMonth) revMonth += b.total;
    if (d >= startOfYear) revYear += b.total;
  });

  const revEl = document.getElementById('revenue-breakdown-list');
  if (revEl) {
    revEl.innerHTML = `
      <div class="status-row"><span>Today</span><strong style="color:var(--gold)">₱${revToday.toLocaleString()}</strong></div>
      <div class="status-row"><span>This Week</span><strong style="color:var(--gold)">₱${revWeek.toLocaleString()}</strong></div>
      <div class="status-row"><span>This Month</span><strong style="color:var(--gold)">₱${revMonth.toLocaleString()}</strong></div>
      <div class="status-row"><span>This Year</span><strong style="color:var(--gold)">₱${revYear.toLocaleString()}</strong></div>
    `;
  }

  // Recent Bookings panel
  const rb = document.getElementById('dash-recent-bookings');
  if (rb) {
    const recent = [...bookings].reverse().slice(0, 6);
    rb.innerHTML = recent.length ? recent.map(b => `
      <div class="dash-recent-row">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.guest}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">Rm.${b.room} · ${b.checkin} → ${b.checkout}</div>
        </div>
        ${badge(b.status)}
      </div>`).join('') : '<div style="color:var(--text-muted);font-size:.82rem;padding:.5rem 0">No bookings yet.</div>';
  }
  // Dashboard room cards
  const dGrid = document.getElementById('dash-rooms-grid');
  if (dGrid) {
    dGrid.innerHTML = '';
    rooms.forEach(r => {
      const sc = statusColor(r.status);
      const guestDots = Array.from({ length: 6 }, (_, i) => `<span class="guest-dot${i < r.cap ? ' filled' : ''}"></span>`).join('');
      dGrid.innerHTML += `<div class="dash-room-card" onclick="showPage('browse')" title="View in Browse Rooms">
        <div class="dash-room-img"><img src="${r.img}" alt="${r.name}" loading="lazy"/><span class="dash-room-badge" style="background:${sc.bg}">${r.status}</span></div>
        <div class="dash-room-info">
          <div class="dash-room-name">${r.name}</div>
          <div class="dash-room-meta">Rm.${r.id} · ${r.type} · ${r.floor}</div>
          <div class="guest-capacity-row"><i class="bx bx-group"></i> ${r.cap} Guest${r.cap > 1 ? 's' : ''}<div class="guest-dots" style="margin-left:.5rem">${guestDots}</div></div>
          <div class="dash-room-rate">₱${r.rate.toLocaleString()}<span>/night</span></div>
        </div>
      </div>`;
    });
  }
}

/* ===== MANAGE ROOMS (ADMIN DASHBOARD PANEL) ===== */
let editingRoomId = null;
let isAddingRoom = false;
let mrCurrentPhotos = []; // array of { src: 'data:...' or 'images/...' }

function renderManageRoomsList() {
  const el = document.getElementById('manage-rooms-list');
  if (!el) return;
  el.innerHTML = '';
  rooms.forEach(r => {
    const sc = statusColor(r.status);
    el.innerHTML += `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .4rem;border-bottom:1px solid var(--border);gap:.5rem">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</div>
          <div style="font-size:.73rem;color:var(--text-muted)">
            Rm.${r.id} · <span style="color:${sc.bg};font-weight:600">${r.status}</span> · ₱${r.rate.toLocaleString()}/night
          </div>
        </div>
        <button class="act-btn" onclick="openManageRoomModal('${r.id}')" style="white-space:nowrap;flex-shrink:0">
          <i class='bx bx-edit-alt'></i> Edit
        </button>
      </div>`;
  });
}

function openAddRoomModal() {
  isAddingRoom = true;
  editingRoomId = null;
  mrCurrentPhotos = [];
  document.getElementById('mr-mode-label').textContent = 'ADD ROOM';
  document.getElementById('manage-room-title').textContent = 'Add New Room';
  document.getElementById('mr-id').value = '';
  document.getElementById('mr-id').readOnly = false;
  document.getElementById('mr-name').value = '';
  document.getElementById('mr-type').value = 'Standard';
  document.getElementById('mr-floor').value = '';
  document.getElementById('mr-status').value = 'Available';
  document.getElementById('mr-rate').value = '';
  document.getElementById('mr-cap').value = '';
  document.getElementById('mr-desc').value = '';
  document.getElementById('mr-amenities').value = '';
  document.getElementById('mr-inside').value = '';
  const wrap = document.getElementById('mr-status-wrap');
  if (wrap) wrap.style.display = 'none'; // hidden for new rooms
  renderPhotoPreview();
  document.getElementById('manage-room-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function openManageRoomModal(id) {
  const r = rooms.find(x => x.id === id);
  if (!r) return;
  isAddingRoom = false;
  editingRoomId = id;
  mrCurrentPhotos = (r.gallery && r.gallery.length ? r.gallery : (r.img ? [r.img] : [])).map(s => ({ src: s }));
  document.getElementById('mr-mode-label').textContent = 'MANAGE ROOM';
  document.getElementById('manage-room-title').textContent = `Edit Room — Rm. ${r.id}: ${r.name}`;
  document.getElementById('mr-id').value = r.id;
  document.getElementById('mr-id').readOnly = true;
  document.getElementById('mr-name').value = r.name;
  document.getElementById('mr-type').value = r.type;
  document.getElementById('mr-floor').value = r.floor || '';
  document.getElementById('mr-status').value = r.status || 'Available';
  document.getElementById('mr-rate').value = r.rate;
  document.getElementById('mr-cap').value = r.cap;
  document.getElementById('mr-desc').value = r.desc || r.desc_text || '';
  document.getElementById('mr-amenities').value = (r.amenities || []).join(', ');
  // Populate What's Inside (strip HTML tags for editing)
  const insideArr = r.inside || [];
  document.getElementById('mr-inside').value = insideArr.map(i => i.replace(/<[^>]+>/g, '').trim()).join('\n');
  // Show status for editing (admin can set Maintenance manually)
  const wrap = document.getElementById('mr-status-wrap');
  if (wrap) wrap.style.display = '';
  renderPhotoPreview();
  document.getElementById('manage-room-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function renderPhotoPreview() {
  const grid = document.getElementById('mr-photo-preview');
  if (!grid) return;
  if (!mrCurrentPhotos.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:.82rem;padding:.5rem">No photos yet. Click "Add Photo" to upload.</div>';
    return;
  }
  grid.innerHTML = mrCurrentPhotos.map((p, i) => `
    <div class="mr-photo-item">
      <img src="${p.src}" alt="Photo ${i+1}" />
      <button class="mr-photo-delete" onclick="removeRoomPhoto(${i})" title="Delete this photo">
        <i class='bx bx-trash'></i>
      </button>
      ${i === 0 ? '<span class="mr-photo-main">Main</span>' : ''}
    </div>`).join('');
}

function handleRoomPhotoUpload(input) {
  const files = Array.from(input.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      mrCurrentPhotos.push({ src: e.target.result });
      renderPhotoPreview();
    };
    reader.readAsDataURL(file);
  });
  input.value = ''; // reset so same file can be re-added
}

function removeRoomPhoto(idx) {
  mrCurrentPhotos.splice(idx, 1);
  renderPhotoPreview();
}

function closeManageRoomModal(e) {
  if (e && e.target !== document.getElementById('manage-room-modal')) return;
  document.getElementById('manage-room-modal').style.display = 'none';
  document.body.style.overflow = '';
  editingRoomId = null;
  isAddingRoom = false;
}

async function saveRoomChanges() {
  const rid      = document.getElementById('mr-id').value.trim();
  const name     = document.getElementById('mr-name').value.trim();
  const type     = document.getElementById('mr-type').value;
  const floor    = document.getElementById('mr-floor').value.trim();
  const statusEl = document.getElementById('mr-status');
  const status   = statusEl ? statusEl.value : 'Available';
  const rate     = parseInt(document.getElementById('mr-rate').value);
  const cap      = parseInt(document.getElementById('mr-cap').value);
  const desc     = document.getElementById('mr-desc').value.trim();
  const amenities= document.getElementById('mr-amenities').value.split(',').map(s => s.trim()).filter(Boolean);
  // Build inside items from textarea (one per line)
  const insideLines = (document.getElementById('mr-inside').value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const inside = insideLines.map(line => `<i class="bx bx-check-circle"></i> ${line}`);
  if (!name) { toast('Room name cannot be empty.', 'error'); return; }
  if (!rate || rate < 0) { toast('Please enter a valid rate.', 'error'); return; }
  if (!cap || cap < 1)   { toast('Capacity must be at least 1.', 'error'); return; }

  // Upload any new base64 photos to the server, get back server URLs
  const resolvedPhotos = [];
  for (const p of mrCurrentPhotos) {
    if (p.src.startsWith('data:')) {
      const res = await api('POST', '/api/upload-image', { dataUrl: p.src, filename: 'room.png' });
      resolvedPhotos.push(res.url || p.src);
    } else {
      resolvedPhotos.push(p.src);
    }
  }
  const mainImg = resolvedPhotos[0] || 'images/1.png';

  if (isAddingRoom) {
    if (!rid) { toast('Room ID cannot be empty.', 'error'); return; }
    const res = await api('POST', '/api/rooms', { id: rid, name, type, floor, cap, rate, status, rating: 0, img: mainImg, gallery: resolvedPhotos, amenities, desc, inside });
    if (res.error) { toast(res.error, 'error'); return; }
    toast(`Room ${rid} added! <i class="bx bx-check-circle"></i>`, 'success');
  } else {
    const res = await api('PUT', `/api/rooms/${editingRoomId}`, { name, type, floor, status, rate, cap, desc, amenities, gallery: resolvedPhotos, img: mainImg, inside });
    if (res.error) { toast(res.error, 'error'); return; }
    toast(`Room updated! <i class="bx bx-check-circle"></i>`, 'success');
  }

  document.getElementById('manage-room-modal').style.display = 'none';
  document.body.style.overflow = '';
  editingRoomId = null;
  isAddingRoom = false;
  await loadRooms();
  renderDashboard();
  renderRooms();
  syncBookingRoomSelect();
}

function animateCount(id, target, prefix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  let start = 0; const dur = 800; const step = Math.ceil(target / 40);
  const t = setInterval(() => { start += step; if (start >= target) { start = target; clearInterval(t); } el.textContent = prefix + start.toLocaleString(); }, dur / 40);
}

function badge(status) {
  const map = { Confirmed: 'badge-confirmed', Pending: 'badge-pending', Completed: 'badge-completed', Cancelled: 'badge-cancelled' };
  return `<span class="badge ${map[status] || ''}">${status}</span>`;
}

/* ===== BROWSE ROOMS ===== */
function renderRooms() { filterRooms(); }

function filterRooms() {
  const type = document.getElementById('filter-type').value;
  const avail = document.getElementById('filter-avail').value;
  const search = (document.getElementById('room-search').value || '').toLowerCase();
  const guestVal = parseInt(document.getElementById('filter-guests').value || '0');
  const filtered = rooms.filter(r => {
    if (type !== 'All' && r.type !== type) return false;
    if (avail !== 'All' && r.status !== avail) return false;
    if (guestVal > 0 && r.cap < guestVal) return false;
    if (search && !r.name.toLowerCase().includes(search) && !r.type.toLowerCase().includes(search)) return false;
    return true;
  });
  const guestLabel = guestVal > 0 ? ` · ${guestVal}+ guests` : '';
  document.getElementById('filter-count').textContent = `Showing ${filtered.length} of ${rooms.length} rooms${guestLabel}`;
  document.getElementById('guest-slider-val').textContent = guestVal === 0 ? 'Any' : guestVal + '+';
  const grid = document.getElementById('rooms-grid');
  grid.innerHTML = '';
  if (!filtered.length) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted)">No rooms match your search.</div>'; return; }
  filtered.forEach(r => {
    const sc = statusColor(r.status);
    const guestDots = Array.from({ length: 6 }, (_, i) => `<span class="guest-dot${i < r.cap ? ' filled' : ''}"></span>`).join('');
    // Booking notification badge
    const today = new Date().toISOString().split('T')[0];
    const activeBooking = bookings.find(b =>
      b.room === r.id && b.status === 'Confirmed' &&
      b.checkin <= today && b.checkout >= today);
    const bookingBadge = activeBooking
      ? `<span class="room-booking-badge"><i class='bx bx-calendar-check'></i> Booked: ${activeBooking.checkin} – ${activeBooking.checkout}</span>`
      : '';
    grid.innerHTML += `<div class="room-card" onclick="openRoomModal('${r.id}')">
      <div class="room-card-img">
        <img src="${r.img}" alt="${r.name}" loading="lazy"/>
        <span class="room-img-status" style="background:${sc.bg};color:${sc.color}">${r.status}</span>
        <span class="room-img-price">₱${r.rate.toLocaleString()}/night</span>
        ${bookingBadge}
      </div>
      <div class="room-card-body">
        <div class="room-card-top">
          <div class="room-card-name">${r.name}</div>
          <div class="room-card-rating"><i class="bx bxs-star"></i> ${r.rating}</div>
        </div>
        <div class="room-card-meta">${r.type} — ${r.floor}</div>
        <div class="guest-capacity-row"><i class="bx bx-group"></i> <span>${r.cap} Guest${r.cap > 1 ? 's' : ''}</span><div class="guest-dots">${guestDots}</div></div>
        <div class="amenity-tags">${r.amenities.slice(0, 3).map(a => `<span class="amenity-tag">${a}</span>`).join('')}${r.amenities.length > 3 ? `<span class="amenity-tag">+${r.amenities.length - 3} more</span>` : ''}</div>
        <button class="btn-primary full-w" onclick="event.stopPropagation();bookRoom('${r.id}')" style="${r.status !== 'Available' ? 'opacity:.5;cursor:not-allowed' : ''}" ${r.status !== 'Available' ? 'disabled' : ''}>
          ${r.status === 'Available' ? 'Book This Room →' : 'Not Available'}
        </button>
      </div>
    </div>`;
  });
}

function statusColor(s) {
  return s === 'Available' ? { bg: 'rgba(95, 6, 124, 0.95)', color: '#fff' } : s === 'Occupied' ? { bg: 'rgba(247,183,49,.85)', color: '#fff' } : { bg: 'rgba(253,150,68,.85)', color: '#fff' };
}

/* ===== ROOM MODAL WITH 360° VIEW ===== */
function openRoomModal(id) {
  const r = rooms.find(x => x.id === id);
  if (!r) return;
  selectedRoomForModal = r;

  document.getElementById('modal-main-img').src = r.img;

  const gal = document.getElementById('modal-gallery');
  if (r.gallery && r.gallery.length > 0) {
    gal.innerHTML = r.gallery.map((src, idx) => `<img src="${src}" onclick="setModalImage('${src}', this)" class="${idx === 0 ? 'active' : ''}">`).join('');
  } else {
    gal.innerHTML = '';
  }

  const sc = statusColor(r.status);
  const badge = document.getElementById('modal-status-badge');
  badge.textContent = r.status; badge.style.background = sc.bg; badge.style.color = sc.color;
  document.getElementById('modal-price-badge').textContent = `₱${r.rate.toLocaleString()}/night`;
  document.getElementById('modal-name').textContent = r.name;
  document.getElementById('modal-meta').textContent = `${r.type} · ${r.floor} · ${r.cap} guests`;
  document.getElementById('modal-rating').innerHTML = `<i class="bx bxs-star"></i> ${r.rating}`;
  document.getElementById('modal-desc').textContent = r.desc;

  // Inside items
  document.getElementById('modal-inside-grid').innerHTML = r.inside.map(i => `<div class="inside-item">${i}</div>`).join('');
  document.getElementById('modal-amenities').innerHTML = r.amenities.map(a => `<span class="amenity-tag">${a}</span>`).join('');

  document.getElementById('modal-details').innerHTML = `
    <div class="modal-detail-item"><div class="modal-detail-val">${r.type}</div><div class="modal-detail-key">Room Type</div></div>
    <div class="modal-detail-item"><div class="modal-detail-val">${r.floor}</div><div class="modal-detail-key">Floor</div></div>
    <div class="modal-detail-item"><div class="modal-detail-val">${r.cap} guests</div><div class="modal-detail-key">Capacity</div></div>`;

  const bookBtn = document.getElementById('modal-book-btn');
  if (r.status === 'Available') { bookBtn.disabled = false; bookBtn.style.opacity = '1'; bookBtn.textContent = 'Book This Room →'; }
  else { bookBtn.disabled = true; bookBtn.style.opacity = '.5'; bookBtn.textContent = 'Not Available'; }
  // Reviews
  loadRoomReviews(r.id);
  // Show Write Review btn if user has a booking for this room
  const rateBtn = document.getElementById('modal-rate-btn');
  if (rateBtn) {
    if (!isAdmin() && currentUser) {
      const hasBk = bookings.some(b => b.room === r.id &&
        (b.email === currentUser.email || b.booked_by === currentUser.email) &&
        (b.status === 'Confirmed' || b.status === 'Completed'));
      rateBtn.style.display = hasBk ? '' : 'none';
    } else { rateBtn.style.display = 'none'; }
  }

  document.getElementById('room-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function setModalImage(src, el) {
  document.getElementById('modal-main-img').src = src;
  const all = document.getElementById('modal-gallery').querySelectorAll('img');
  all.forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}

function openLightbox() {
  const src = document.getElementById('modal-main-img').src;
  if (!src) return;
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}



function bookFromModal() {
  if (selectedRoomForModal) bookRoom(selectedRoomForModal.id);
  closeRoomModal();
}

function closeRoomModal() {
  document.getElementById('room-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function closeModal(e) { if (e.target === document.getElementById('room-modal')) closeRoomModal(); }

function bookRoom(id) {
  const r = rooms.find(x => x.id === id);
  if (!r || r.status !== 'Available') { toast('This room is not available.', 'error'); return; }
  const map = {};
  rooms.forEach(r => { map[r.id] = `${r.id}|${r.type}|${r.rate}|${r.floor}|${r.cap}`; });
  const sel = document.getElementById('f-room');
  if (map[id]) {
    let found = false;
    for (let o of sel.options) if (o.value === map[id]) { found = true; sel.value = map[id]; break; }
    if (!found) { const o = new Option(`Rm. ${r.id} — ${r.type} (₱${r.rate.toLocaleString()}/night)`, map[id]); sel.add(o); sel.value = map[id]; }
  }
  showPage('newbooking'); updateSummary();
}

/* ===== BOOKING FORM ===== */
function updateSummary() {
  const rv = document.getElementById('f-room').value;
  const ci = document.getElementById('f-checkin').value;
  const co = document.getElementById('f-checkout').value;
  if (!rv) { clearSummary(); return; }
  const [rm, type, rate] = rv.split('|');
  document.getElementById('sum-room').textContent = `Rm. ${rm} (${type})`;
  document.getElementById('sum-rate').textContent = `₱${parseInt(rate).toLocaleString()}`;
  if (ci && co) {
    const d1 = new Date(ci), d2 = new Date(co);
    const nights = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
    if (nights > 0) {
      document.getElementById('sum-nights').textContent = nights + ' night' + (nights > 1 ? 's' : '');
      document.getElementById('sum-total').textContent = `₱${(nights * parseInt(rate)).toLocaleString()}`;
    } else { document.getElementById('sum-nights').textContent = '—'; document.getElementById('sum-total').textContent = '—'; }
  }
}

function clearSummary() {
  ['sum-room', 'sum-rate', 'sum-nights', 'sum-total'].forEach(id => document.getElementById(id).textContent = '—');
}

async function confirmBooking() {
  const btn = document.querySelector('button[onclick="confirmBooking()"]');
  const originalBtnHtml = btn ? btn.innerHTML : '';

  const name  = document.getElementById('f-name').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const rv    = document.getElementById('f-room').value;
  const ci    = document.getElementById('f-checkin').value;
  const co    = document.getElementById('f-checkout').value;
  const notes = document.getElementById('f-notes').value.trim();
  if (!name || !email || !phone) { toast('Please fill in all guest details.', 'error'); return; }
  if (!rv)   { toast('Please select a room.', 'error'); return; }
  if (!ci || !co) { toast('Please select check-in and check-out dates.', 'error'); return; }
  const d1 = new Date(ci), d2 = new Date(co);
  const nights = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
  if (nights <= 0) { toast('Check-out must be after check-in.', 'error'); return; }
  const [rm, type, rate, floor, cap] = rv.split('|');
  const total = nights * parseInt(rate);
  bookingCounter++;
  localStorage.setItem('hb_counter', bookingCounter);
  const bkId = editingBookingId || `BK-${new Date().getFullYear()}-${bookingCounter}`;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Processing...`;
  }

  let res;
  if (editingBookingId) {
    res = await api('PUT', `/api/bookings/${editingBookingId}`, {
      guest: name, email, phone, room: rm, type, floor, cap: `${cap} guests`,
      rate: parseInt(rate), checkin: ci, checkout: co, nights, total, notes
    });
    toast('Booking updated! <i class="bx bx-sparkles"></i>', 'success');
  } else {
    res = await api('POST', '/api/bookings', {
      id: bkId, guest: name, email, phone, room: rm, type, floor,
      cap: `${cap} guests`, rate: parseInt(rate), checkin: ci, checkout: co,
      nights, total, status: 'Pending', notes
    });
    toast('Booking submitted and is pending approval! <i class="bx bx-time"></i>', 'success');
  }
  if (res && res.error) { 
    if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
    toast(res.error, 'error'); 
    return; 
  }
  editingBookingId = null;
  const titleEl = document.querySelector('#page-newbooking .page-title');
  if (titleEl) titleEl.textContent = 'New Booking — Input Form';
  await loadBookings();
  await loadRooms();
  const bk = bookings.find(b => b.id === bkId) || { id: bkId, guest: name, email, phone, room: rm, type, floor, cap: `${cap} guests`, rate: parseInt(rate), checkin: ci, checkout: co, nights, total };
  if (isAdmin()) renderAllBookings(); else renderMyBookings();
  showConfirmation(bk);
  if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
}

function showConfirmation(bk) {
  document.getElementById('conf-ref').textContent = bk.id;
  document.getElementById('conf-name').textContent = bk.guest;
  document.getElementById('conf-email').textContent = bk.email;
  document.getElementById('conf-phone').textContent = bk.phone;
  document.getElementById('conf-room').textContent = `Room ${bk.room}`;
  document.getElementById('conf-type').textContent = bk.type;
  document.getElementById('conf-floor').textContent = bk.floor;
  document.getElementById('conf-cap').textContent = bk.cap;
  document.getElementById('conf-checkin').textContent = bk.checkin;
  document.getElementById('conf-checkout').textContent = bk.checkout;
  document.getElementById('conf-nights').textContent = bk.nights + ' night' + (bk.nights > 1 ? 's' : '');
  document.getElementById('conf-rate').textContent = `₱${bk.rate.toLocaleString()}`;
  document.getElementById('conf-total').textContent = `₱${bk.total.toLocaleString()}`;
  document.getElementById('conf-formula').textContent = `₱${bk.rate.toLocaleString()} × ${bk.nights} nights = ₱${bk.total.toLocaleString()}`;
  document.getElementById('conf-footer-note').textContent = `Created: ${new Date().toLocaleDateString()} · Ref: ${bk.id}`;
  // Update the view bookings button label based on role
  const labelEl = document.getElementById('conf-view-bookings-label');
  if (labelEl) labelEl.textContent = isAdmin() ? 'View All Bookings' : 'View My Bookings';
  showPage('confirmation');
}

function resetForm() {
  editingBookingId = null;
  const titleEl = document.querySelector('#page-newbooking .page-title');
  if (titleEl) titleEl.textContent = 'New Booking — Input Form';
  if (!isAdmin()) {
    // Keep user's info pre-filled, only clear room/dates/notes
    document.getElementById('f-notes').value = '';
  } else {
    ['f-name', 'f-email', 'f-phone', 'f-notes'].forEach(id => document.getElementById(id).value = '');
  }
  document.getElementById('f-room').value = '';
  document.getElementById('f-checkin').value = '';
  document.getElementById('f-checkout').value = '';
  clearSummary();
}

function prefillBookingForm() {
  if (!currentUser || isAdmin()) return;
  const nameEl = document.getElementById('f-name');
  const emailEl = document.getElementById('f-email');
  const phoneEl = document.getElementById('f-phone');
  if (nameEl) { nameEl.value = `${currentUser.fname} ${currentUser.lname}`; nameEl.readOnly = true; }
  if (emailEl) { emailEl.value = currentUser.email; emailEl.readOnly = true; }
  if (phoneEl && currentUser.phone) { phoneEl.value = currentUser.phone; phoneEl.readOnly = true; }
}

/* ===== ALL BOOKINGS ===== */
function renderAllBookings() {
  const filter = document.getElementById('ab-filter').value;
  const list = filter === 'All' ? bookings : bookings.filter(b => b.status === filter);
  const tbody = document.getElementById('all-tbody');
  tbody.innerHTML = '';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">No bookings found.</td></tr>'; return; }
  [...list].reverse().forEach(b => {
    tbody.innerHTML += `<tr>
      <td style="color:var(--accent);font-weight:600">${b.id}</td>
      <td><div style="font-weight:600">${b.guest}</div><div style="font-size:.75rem;color:var(--text-muted)">${b.email}</div></td>
      <td>Rm. ${b.room} (${b.type})</td>
      <td>${b.checkin}</td><td>${b.checkout}</td>
      <td style="font-weight:700">₱${b.total.toLocaleString()}</td>
      <td>${badge(b.status)}</td>
      <td>
        <button class="act-btn" onclick="updateBooking('${b.id}')" style="margin-right:.3rem">Update</button>
        <button class="act-btn danger" onclick="changeStatus('${b.id}','Cancelled')" style="margin-right:.3rem">Cancel</button>
        ${b.status === 'Pending' ? `<button class="act-btn" onclick="changeStatus('${b.id}','Confirmed')" style="margin-right:.3rem">Confirm</button>` : ''}
        ${b.status === 'Confirmed' ? `<button class="act-btn" onclick="changeStatus('${b.id}','Completed')">Done</button>` : ''}
      </td>
    </tr>`;
  });
}

/* ===== MY BOOKINGS (USER VIEW) ===== */
function renderMyBookings() {
  if (!currentUser) return;
  const myList = bookings.filter(b => b.bookedBy === currentUser.email || b.email === currentUser.email);
  const tbody = document.getElementById('my-tbody');
  const emptyEl = document.getElementById('my-empty');
  const summaryEl = document.getElementById('my-bookings-summary');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Summary cards for user
  const confirmed = myList.filter(b => b.status === 'Confirmed').length;
  const total = myList.reduce((s, b) => s + (b.total || 0), 0);
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="my-bk-stats">
        <div class="my-bk-stat"><div class="my-bk-num">${myList.length}</div><div class="my-bk-lbl">Total Bookings</div></div>
        <div class="my-bk-stat"><div class="my-bk-num">${confirmed}</div><div class="my-bk-lbl">Confirmed</div></div>
        <div class="my-bk-stat"><div class="my-bk-num">&#8369;${total.toLocaleString()}</div><div class="my-bk-lbl">Total Spent</div></div>
      </div>`;
  }

  if (!myList.length) {
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  [...myList].reverse().forEach(b => {
    const canEdit = b.status === 'Confirmed' || b.status === 'Pending';
    const canReview = b.status === 'Completed';
    tbody.innerHTML += `<tr>
      <td style="color:var(--accent);font-weight:600">${b.id}</td>
      <td>Rm. ${b.room} <span style="font-size:.75rem;color:var(--text-muted)">(${b.type})</span></td>
      <td>${b.checkin}</td>
      <td>${b.checkout}</td>
      <td>${b.nights}</td>
      <td style="font-weight:700;color:var(--gold)">&#8369;${b.total.toLocaleString()}</td>
      <td>${badge(b.status)}</td>
      <td>
        <div class="my-bk-notes">${b.notes ? `<i class='bx bx-comment-detail' style='color:var(--text-muted)'></i> ${b.notes}` : '<span style="color:var(--text-muted);font-size:.78rem">—</span>'}</div>
      </td>
      <td>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
          ${canEdit ? `<button class="act-btn" onclick="editMyBooking('${b.id}')"><i class='bx bx-edit-alt'></i> Edit</button>
             <button class="act-btn danger" onclick="cancelMyBooking('${b.id}')"><i class='bx bx-x'></i> Cancel</button>` : ''}
          ${canReview ? `<button class="act-btn act-review" onclick="openReviewModal('${b.room}','${b.id}')"><i class='bx bxs-star'></i> Rate</button>` : ''}
          ${!canEdit && !canReview ? '<span style="color:var(--text-muted);font-size:.78rem">—</span>' : ''}
        </div>
      </td>
    </tr>`;
  });
}

async function cancelMyBooking(id) {
  if (!confirm(`Cancel booking ${id}?`)) return;
  const res = await api('PATCH', `/api/bookings/${id}/status`, { status: 'Cancelled' });
  if (res && res.error) { toast(res.error, 'error'); return; }
  await loadBookings();
  await loadRooms();
  renderMyBookings();
  toast(`Booking ${id} cancelled.`, 'success');
}

function editMyBooking(id) {
  const bk = bookings.find(b => b.id === id);
  if (!bk) return;
  editingBookingId = id;
  // Allow editing own fields (name/phone/notes are pre-filled from profile, but allow changes)
  const nameEl = document.getElementById('f-name');
  const emailEl = document.getElementById('f-email');
  const phoneEl = document.getElementById('f-phone');
  if (nameEl) { nameEl.value = bk.guest; nameEl.readOnly = false; }
  if (emailEl) { emailEl.value = bk.email; emailEl.readOnly = true; }
  if (phoneEl) { phoneEl.value = bk.phone; phoneEl.readOnly = false; }
  document.getElementById('f-notes').value = bk.notes || '';
  const sel = document.getElementById('f-room');
  for (let o of sel.options) {
    if (o.value.startsWith(bk.room + '|')) { sel.value = o.value; break; }
  }
  document.getElementById('f-checkin').value = bk.checkin;
  document.getElementById('f-checkout').value = bk.checkout;
  updateSummary();
  showPage('newbooking');
  const titleEl = document.querySelector('#page-newbooking .page-title');
  if (titleEl) titleEl.textContent = 'Update Booking — ' + id;
}

async function changeStatus(id, status) {
  const res = await api('PATCH', `/api/bookings/${id}/status`, { status });
  if (res && res.error) { toast(res.error, 'error'); return; }
  await loadBookings();
  await loadRooms();
  renderAllBookings();
  renderDashboard();
  toast(`Booking ${id} updated to ${status}.`, 'success');
}

function updateBooking(id) {
  const bk = bookings.find(b => b.id === id);
  if (!bk) return;
  editingBookingId = id;
  document.getElementById('f-name').value = bk.guest;
  document.getElementById('f-email').value = bk.email;
  document.getElementById('f-phone').value = bk.phone;
  document.getElementById('f-notes').value = bk.notes || '';

  const sel = document.getElementById('f-room');
  for (let o of sel.options) {
    if (o.value.startsWith(bk.room + '|')) { sel.value = o.value; break; }
  }

  document.getElementById('f-checkin').value = bk.checkin;
  document.getElementById('f-checkout').value = bk.checkout;

  updateSummary();
  showPage('newbooking');
  const titleEl = document.querySelector('#page-newbooking .page-title');
  if (titleEl) titleEl.textContent = 'Update Booking — ' + id;
}

/* ===== SETTINGS ===== */
function loadSettings() {
  if (!currentUser) return;
  document.getElementById('set-fname').value = currentUser.fname;
  document.getElementById('set-lname').value = currentUser.lname;
  document.getElementById('set-email').value = currentUser.email;
  document.getElementById('set-phone').value = currentUser.phone || '';
  const initials = (currentUser.fname[0] + (currentUser.lname[0] || '')).toUpperCase();
  document.getElementById('set-avatar-display').textContent = initials;
  document.getElementById('set-avatar-name').textContent = currentUser.fname + ' ' + currentUser.lname;
  document.getElementById('set-avatar-role').textContent = currentUser.role;
  document.getElementById('set-avatar-email').textContent = currentUser.email;
}

async function saveProfile() {
  if (!currentUser) return;
  const fname = document.getElementById('set-fname').value.trim();
  const lname = document.getElementById('set-lname').value.trim();
  const email = document.getElementById('set-email').value.trim();
  const phone = document.getElementById('set-phone').value.trim();
  const res = await api('PUT', '/api/me', { fname, lname, email, phone });
  if (res.error) { toast(res.error, 'error'); return; }
  currentUser = res;
  updateSidebarUser(); loadSettings();
  toast('Profile updated! <i class="bx bx-sparkles"></i>', 'success');
}

async function changePassword() {
  const old = document.getElementById('set-oldpw').value;
  const nw  = document.getElementById('set-newpw').value;
  const cp  = document.getElementById('set-cpw').value;
  if (!old || !nw || !cp) { toast('Please fill in all password fields.', 'error'); return; }
  if (nw.length < 6) { toast('New password must be at least 6 characters.', 'error'); return; }
  if (nw !== cp) { toast('New passwords do not match.', 'error'); return; }
  const res = await api('PUT', '/api/me/password', { old, new: nw });
  if (res.error) { toast(res.error, 'error'); return; }
  document.getElementById('set-oldpw').value = '';
  document.getElementById('set-newpw').value = '';
  document.getElementById('set-cpw').value = '';
  toast('Password changed! <i class="bx bx-lock-alt"></i>', 'success');
}

function toggleDarkMode(cb) {
  document.body.classList.toggle('light', !cb.checked);
}

/* ===== REVIEWS ===== */
let _reviewRoomId = null;

async function loadRoomReviews(rid) {
  const el = document.getElementById('modal-reviews-list');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem">Loading reviews…</div>';
  const data = await api('GET', `/api/rooms/${rid}/reviews`);
  if (!Array.isArray(data) || !data.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;padding:.3rem 0">No reviews yet. Be the first to rate this room!</div>';
    return;
  }
  el.innerHTML = data.map(rv => {
    const stars = '★'.repeat(rv.rating) + '☆'.repeat(5 - rv.rating);
    const date = rv.created_at ? rv.created_at.split('T')[0] : '';
    return `<div class="review-card">
      <div class="review-top">
        <span class="review-stars">${stars}</span>
        <span class="review-name">${rv.user_name}</span>
        <span class="review-date">${date}</span>
      </div>
      ${rv.comment ? `<p class="review-comment">${rv.comment}</p>` : ''}
    </div>`;
  }).join('');
}

// roomId and bookingId can be passed directly (from My Bookings table)
// or left blank when called from the Room Modal (uses selectedRoomForModal)
let _reviewBookingId = null;
function openReviewModal(roomId, bookingId) {
  // Support calling from Room Modal (no args) OR from My Bookings row (with args)
  const rid = roomId || (selectedRoomForModal && selectedRoomForModal.id);
  if (!rid) return;
  _reviewRoomId = rid;
  _reviewBookingId = bookingId || null;
  const room = rooms.find(r => r.id === rid);
  const roomName = room ? room.name : `Room ${rid}`;
  document.getElementById('review-room-title').textContent = `Rate: ${roomName}`;
  document.getElementById('review-rating').value = '0';
  document.getElementById('review-comment').value = '';
  setReviewStar(0);
  document.getElementById('review-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeReviewModal(e) {
  // Allow closing via X button (no event) or clicking the backdrop
  if (e && e.target !== document.getElementById('review-modal')) return;
  document.getElementById('review-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function setReviewStar(val) {
  document.getElementById('review-rating').value = val;
  document.querySelectorAll('.star-pick').forEach((s, i) => {
    s.classList.toggle('active', i < val);
  });
}

async function submitReview() {
  const rating = parseInt(document.getElementById('review-rating').value);
  const comment = document.getElementById('review-comment').value.trim();
  if (!rating) { toast('Please select a star rating.', 'error'); return; }
  if (!_reviewRoomId) return;
  // Use pre-passed bookingId (from My Bookings) or find one automatically
  let bkId = _reviewBookingId;
  if (!bkId) {
    const bk = bookings.find(b => b.room === _reviewRoomId &&
      (b.email === currentUser.email || b.booked_by === currentUser.email) &&
      (b.status === 'Confirmed' || b.status === 'Completed'));
    bkId = bk ? bk.id : '';
  }
  const res = await api('POST', `/api/rooms/${_reviewRoomId}/reviews`, {
    rating, comment, booking_id: bkId
  });
  if (res.error) { toast(res.error, 'error'); return; }
  toast('Review submitted! <i class="bx bx-star"></i>', 'success');
  document.getElementById('review-modal').style.display = 'none';
  document.body.style.overflow = '';
  await loadRooms();
  loadRoomReviews(_reviewRoomId);
  // Update rating display in room modal if open
  const updatedRoom = rooms.find(r => r.id === _reviewRoomId);
  if (updatedRoom) {
    const ratingEl = document.getElementById('modal-rating');
    if (ratingEl) ratingEl.innerHTML = `<i class="bx bxs-star"></i> ${updatedRoom.rating || '—'}`;
  }
}

/* ===== TOAST ===== */
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.innerHTML = msg; t.className = 'toast ' + type;
  void t.offsetWidth; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

/* ===== BOOKING CALENDAR ===== */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function calPrev() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } calRender(); }
function calNext() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } calRender(); }

function calRender() {
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month-label');
  if (!grid || !label) return;
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  label.textContent = `${MONTHS[calMonth]} ${calYear}`;

  // Build a map of dates → booking info
  const today = new Date(); today.setHours(0,0,0,0);
  const dateMap = {}; // 'YYYY-MM-DD' → { type: 'checkin'|'checkout'|'occupied', bk }
  bookings.forEach(b => {
    if (b.status === 'Cancelled' || b.status === 'Completed') return;
    if (b.checkin) dateMap[b.checkin] = { type: 'checkin', bk: b };
    if (b.checkout) dateMap[b.checkout] = { type: 'checkout', bk: b };
    // Mark all days in between as occupied
    if (b.checkin && b.checkout) {
      let d = new Date(b.checkin); d.setDate(d.getDate() + 1);
      const end = new Date(b.checkout);
      while (d < end) {
        const key = d.toISOString().split('T')[0];
        if (!dateMap[key]) dateMap[key] = { type: 'occupied', bk: b };
        d.setDate(d.getDate() + 1);
      }
    }
  });

  // First day of month
  const first = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  let html = `<div class="cal-header-row">${DAYS.map(d => `<div class="cal-day-label">${d}</div>`).join('')}</div><div class="cal-days-grid">`;
  // Empty cells before first day
  for (let i = 0; i < first; i++) html += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dt = new Date(calYear, calMonth, day);
    const isToday = dt.getTime() === today.getTime();
    const info = dateMap[dateStr];
    let cls = 'cal-cell';
    let dot = '';
    if (isToday) cls += ' cal-today';
    if (info) {
      if (info.type === 'checkin') { cls += ' cal-checkin'; dot = `<span class="cal-cell-dot" style="background:#00c9a7"></span>`; }
      else if (info.type === 'checkout') { cls += ' cal-checkout'; dot = `<span class="cal-cell-dot" style="background:#fd9644"></span>`; }
      else { cls += ' cal-occupied'; dot = `<span class="cal-cell-dot" style="background:var(--gold)"></span>`; }
    }
    const clickFn = info ? `calShowEvents('${dateStr}')` : '';
    html += `<div class="${cls}" ${clickFn ? `onclick="${clickFn}" style="cursor:pointer"` : ''}>${day}${dot}</div>`;
  }
  html += '</div>';
  grid.innerHTML = html;
  // Show events for today by default
  const todayStr = today.toISOString().split('T')[0];
  calShowEvents(todayStr);
}

function calShowEvents(dateStr) {
  const evEl = document.getElementById('cal-events-list');
  if (!evEl) return;
  const dayBookings = bookings.filter(b =>
    b.status !== 'Cancelled' && (b.checkin === dateStr || b.checkout === dateStr ||
    (b.checkin < dateStr && b.checkout > dateStr)));
  if (!dayBookings.length) {
    evEl.innerHTML = `<div style="color:var(--text-muted);font-size:.82rem;padding:.4rem 0">${dateStr} — No bookings on this date.</div>`;
    return;
  }
  evEl.innerHTML = `<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:.4rem;letter-spacing:.04em">${dateStr} BOOKINGS</div>` +
    dayBookings.map(b => {
      const isIn = b.checkin === dateStr, isOut = b.checkout === dateStr;
      const tag = isIn ? `<span style="background:#00c9a7;color:#fff;padding:.1rem .5rem;border-radius:4px;font-size:.7rem">Check-In</span>`
        : isOut ? `<span style="background:#fd9644;color:#fff;padding:.1rem .5rem;border-radius:4px;font-size:.7rem">Check-Out</span>`
        : `<span style="background:var(--gold);color:#fff;padding:.1rem .5rem;border-radius:4px;font-size:.7rem">Staying</span>`;
      return `<div class="cal-event-row">${tag} <strong>${b.guest}</strong> — Rm.${b.room} (${b.type}) &nbsp;${badge(b.status)}</div>`;
    }).join('');
}

/* ===== SYNC BOOKING FORM ROOM SELECT ===== */
function syncBookingRoomSelect() {
  const sel = document.getElementById('f-room');
  if (!sel) return;
  // Keep first empty option
  while (sel.options.length > 1) sel.remove(1);
  rooms.forEach(r => {
    const val = `${r.id}|${r.type}|${r.rate}|${r.floor}|${r.cap}`;
    const opt = new Option(`Rm. ${r.id} — ${r.name} (₱${r.rate.toLocaleString()}/night · ${r.cap} guests)`, val);
    sel.add(opt);
  });
}

/* ===== LANDING PAGE ===== */
function renderLandingRooms() {
  const statRooms = document.getElementById('land-stat-rooms');
  if (statRooms) statRooms.textContent = rooms.length;

  const grid = document.getElementById('land-rooms-grid');
  if (!grid) return;
  grid.innerHTML = '';
  rooms.forEach(r => {
    const sc = statusColor(r.status);
    const guestDots = Array.from({ length: 6 }, (_, i) => `<span class="guest-dot${i < r.cap ? ' filled' : ''}"></span>`).join('');
    grid.innerHTML += `<div class="land-room-card">
      <div class="land-room-img">
        <img src="${r.img}" alt="${r.name}" loading="lazy"/>
        <span class="land-room-badge" style="background:${sc.bg}">${r.status}</span>
        <span class="land-room-price">&#8369;${r.rate.toLocaleString()}<span>/night</span></span>
      </div>
      <div class="land-room-body">
        <div class="land-room-top">
          <div class="land-room-name">${r.name}</div>
          <div class="land-room-rating"><i class="bx bxs-star"></i> ${r.rating}</div>
        </div>
        <div class="land-room-meta">Rm. ${r.id} &middot; ${r.type} &middot; ${r.floor}</div>
        <div class="guest-capacity-row"><i class="bx bx-group"></i> ${r.cap} Guest${r.cap > 1 ? 's' : ''}<div class="guest-dots" style="margin-left:.4rem">${guestDots}</div></div>
        <div class="land-amenity-tags">${r.amenities.slice(0, 3).map(a => `<span>${a}</span>`).join('')}</div>
        <button class="land-book-btn" onclick="showLandingAuth('register')">
          ${r.status === 'Available' ? '<i class="bx bx-calendar-check"></i> Reserve Room' : '<i class="bx bx-x-circle"></i> Not Available'}
        </button>
      </div>
    </div>`;
  });
}

function showLandingAuth(page) {
  document.getElementById('landing-section').style.display = 'none';
  const auth = document.getElementById('auth-section');
  auth.classList.remove('hidden');
  auth.style.display = '';
  showAuth(page);
  window.scrollTo(0, 0);
}

function scrollToRooms() {
  document.getElementById('land-rooms-section').scrollIntoView({ behavior: 'smooth' });
}



/* ===== INIT ===== */

window.onload = async function () {
  // Pre-load rooms for landing page (public, no auth needed)
  await loadRooms();
  renderLandingRooms();

  // Auto-restore session if token saved
  if (_token) {
    try {
      const me = await api('GET', '/api/me').catch(() => null);
      if (me && me.email) {
        currentUser = me;
        await loadBookings();
        // Skip landing — go straight to app
        document.getElementById('landing-section').style.display = 'none';
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app-section').classList.remove('hidden');
        updateSidebarUser();
        applyRoleNav();
        syncBookingRoomSelect();
        if (isAdmin()) { renderDashboard(); renderAllBookings(); showPage('dashboard'); }
        else           { renderMyBookings(); showPage('browse'); }
      } else {
        _token = ''; localStorage.removeItem('nx_token');
      }
    } catch(e) { _token = ''; localStorage.removeItem('nx_token'); }
  }

  syncBookingRoomSelect();
  const today = new Date().toISOString().split('T')[0];
  const ci = document.getElementById('f-checkin');
  const co = document.getElementById('f-checkout');
  if (ci) ci.min = today;
  if (co) co.min = today;
  if (ci) ci.addEventListener('change', function () { if (co) co.min = this.value; updateSummary(); });
};
