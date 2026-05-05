'use strict';
/* ===== NexStay Admin Portal JS ===== */
const ADMIN_API = '';
let _atoken = localStorage.getItem('nx_admin_token') || '';
let adminUser = null;
let arooms = [], abookings = [];
let aeditingRoomId = null, aisAddingRoom = false;
let amrCurrentPhotos = [];
let acalYear = new Date().getFullYear(), acalMonth = new Date().getMonth();

async function aapi(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_atoken}` }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(path, opts);
    return await res.json();
  } catch (e) { return { error: 'Network error' }; }
}

function ashowErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function atoast(msg, type = 'success') {
  const t = document.getElementById('admin-toast');
  t.innerHTML = msg; t.className = 'toast ' + type;
  void t.offsetWidth; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

/* ===== LOGIN ===== */
async function adminLogin() {
  const email = document.getElementById('admin-email').value.trim();
  const pw = document.getElementById('admin-pw').value;
  const err = document.getElementById('admin-login-error');
  err.classList.add('hidden');
  if (!email || !pw) { ashowErr(err, 'Please fill in all fields.'); return; }
  const res = await aapi('POST', '/api/login', { email, pw });
  if (res.error) { ashowErr(err, res.error); return; }
  // Block non-admin accounts
  if (!res.user || res.user.role !== 'Admin') {
    ashowErr(err, 'Access denied. This portal is for Administrators only. Guests must use the Guest Portal.');
    return;
  }
  _atoken = res.token;
  localStorage.setItem('nx_admin_token', _atoken);
  adminUser = res.user;
  await astartApp();
}

function adminLogout() {
  _atoken = '';
  localStorage.removeItem('nx_admin_token');
  adminUser = null;
  document.getElementById('admin-app-section').classList.add('hidden');
  document.getElementById('admin-auth-section').style.display = '';
}

async function astartApp() {
  document.getElementById('admin-auth-section').style.display = 'none';
  document.getElementById('admin-app-section').classList.remove('hidden');
  const av = (adminUser.fname[0] + (adminUser.lname ? adminUser.lname[0] : '')).toUpperCase();
  document.getElementById('admin-avatar').textContent = av;
  document.getElementById('admin-name').textContent = `${adminUser.fname} ${adminUser.lname}`;
  document.getElementById('admin-topbar-name').textContent = adminUser.fname;
  await Promise.all([aloadRooms(), aloadBookings()]);
  ashowPage('dashboard');
}

async function aloadRooms() {
  const data = await aapi('GET', '/api/rooms');
  arooms = Array.isArray(data) ? data : [];
}

async function aloadBookings() {
  const data = await aapi('GET', '/api/bookings');
  abookings = Array.isArray(data) ? data : [];
}

/* ===== PAGES ===== */
function ashowPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('apage-' + p);
  if (pg) pg.classList.add('active');
  const nav = document.getElementById('anav-' + p);
  if (nav) nav.classList.add('active');
  const labels = { dashboard: 'Dashboard', allbookings: 'All Bookings', rooms: 'Manage Rooms', settings: 'Settings' };
  document.getElementById('admin-topbar-page').textContent = labels[p] || p;
  if (p === 'dashboard') arenderDashboard();
  if (p === 'allbookings') arenderAllBookings();
  if (p === 'rooms') arenderRoomsTable();
  if (p === 'settings') aloadSettings();
  window.scrollTo(0, 0);
}

/* ===== DASHBOARD ===== */
function arenderDashboard() {
  const validBookings = abookings.filter(b => b.status === 'Confirmed' || b.status === 'Completed');
  const revenue = validBookings.reduce((s, b) => s + b.total, 0);
  const avail = arooms.filter(r => r.status === 'Available').length;
  document.getElementById('astat-revenue').textContent = `₱${revenue.toLocaleString()}`;
  document.getElementById('astat-confirmed').textContent = validBookings.length;
  document.getElementById('astat-available').textContent = avail;
  document.getElementById('astat-avail-sub').textContent = `of ${arooms.length} total rooms`;
  // Calendar
  acalRender();
  // Room status
  const avR = arooms.filter(r => r.status === 'Available').length;
  const occR = arooms.filter(r => r.status === 'Occupied').length;
  const mntR = arooms.filter(r => r.status === 'Maintenance').length;
  document.getElementById('aroom-status-list').innerHTML = `
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

  const revEl = document.getElementById('arevenue-breakdown-list');
  if (revEl) {
    revEl.innerHTML = `
      <div class="status-row"><span>Today</span><strong style="color:var(--gold)">₱${revToday.toLocaleString()}</strong></div>
      <div class="status-row"><span>This Week</span><strong style="color:var(--gold)">₱${revWeek.toLocaleString()}</strong></div>
      <div class="status-row"><span>This Month</span><strong style="color:var(--gold)">₱${revMonth.toLocaleString()}</strong></div>
      <div class="status-row"><span>This Year</span><strong style="color:var(--gold)">₱${revYear.toLocaleString()}</strong></div>
    `;
  }

  // Recent bookings
  const rb = document.getElementById('adash-recent-bookings');
  if (rb) {
    const recent = [...abookings].reverse().slice(0, 6);
    rb.innerHTML = recent.length ? recent.map(b => `
      <div class="dash-recent-row">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.82rem">${b.guest}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">Rm.${b.room} · ${b.checkin} → ${b.checkout}</div>
        </div>
        <span class="badge badge-${(b.status || '').toLowerCase()}">${b.status}</span>
      </div>`).join('') : '<div style="color:var(--text-muted);font-size:.82rem;padding:.5rem 0">No bookings yet.</div>';
  }
}

/* ===== CALENDAR ===== */
function acalPrev() { acalMonth--; if (acalMonth < 0) { acalMonth = 11; acalYear--; } acalRender(); }
function acalNext() { acalMonth++; if (acalMonth > 11) { acalMonth = 0; acalYear++; } acalRender(); }
function acalRender() {
  const grid = document.getElementById('acal-grid');
  const label = document.getElementById('acal-month-label');
  if (!grid || !label) return;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  label.textContent = `${MONTHS[acalMonth]} ${acalYear}`;
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(acalYear, acalMonth, 1).getDay();
  const daysInMonth = new Date(acalYear, acalMonth + 1, 0).getDate();
  // Build date → booking map
  const dateMap = {};
  abookings.filter(b => b.status === 'Confirmed' || b.status === 'Pending').forEach(b => {
    const ci = new Date(b.checkin), co = new Date(b.checkout);
    for (let d = new Date(ci); d <= co; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      if (!dateMap[ds]) dateMap[ds] = [];
      dateMap[ds].push({ id: b.id, type: ds === b.checkin ? 'checkin' : ds === b.checkout ? 'checkout' : 'booked', guest: b.guest });
    }
  });
  let html = DAYS.map(d => `<div class="cal-day-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${acalYear}-${String(acalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs = dateMap[ds] || [];
    const isToday = ds === today;
    let cls = 'cal-cell'; if (isToday) cls += ' today'; if (evs.length) cls += ' has-event';
    let evHtml = evs.slice(0, 2).map(e => `<div class="cal-event ${e.type}">${e.guest.split(' ')[0]}</div>`).join('');
    if (evs.length > 2) evHtml += `<div class="cal-event booked">+${evs.length - 2}</div>`;
    html += `<div class="${cls}" onclick="acalDayClick('${ds}')">${d}${evHtml}</div>`;
  }
  grid.innerHTML = html;
}
function acalDayClick(ds) {
  const evs = abookings.filter(b => b.checkin <= ds && b.checkout >= ds && (b.status === 'Confirmed' || b.status === 'Pending'));
  const el = document.getElementById('acal-events-list');
  if (!evs.length) { el.innerHTML = `<div style="color:var(--text-muted);font-size:.82rem">${ds} — No bookings on this date.</div>`; return; }
  el.innerHTML = evs.map(b => `<div class="dash-recent-row"><div style="flex:1"><div style="font-weight:600;font-size:.82rem">${b.guest} · Rm.${b.room}</div><div style="font-size:.72rem;color:var(--text-muted)">${b.checkin} → ${b.checkout}</div></div><span class="badge badge-confirmed">${b.status}</span></div>`).join('');
}

/* ===== ALL BOOKINGS ===== */
function arenderAllBookings() {
  const filter = document.getElementById('aab-filter').value;
  const list = filter === 'All' ? abookings : abookings.filter(b => b.status === filter);
  const tbody = document.getElementById('aall-tbody');
  tbody.innerHTML = '';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">No bookings found.</td></tr>'; return; }
  [...list].reverse().forEach(b => {
    tbody.innerHTML += `<tr>
      <td><strong>${b.id}</strong></td>
      <td>${b.guest}<div style="font-size:.75rem;color:var(--text-muted)">${b.email}</div></td>
      <td>Rm. ${b.room}</td>
      <td>${b.checkin}</td><td>${b.checkout}</td>
      <td>₱${(b.total || 0).toLocaleString()}</td>
      <td><span class="badge badge-${(b.status || '').toLowerCase()}">${b.status}</span></td>
      <td>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          ${b.status === 'Pending' ? `<button class="act-btn" onclick="achangeStatus('${b.id}','Confirmed')">Confirm</button>` : ''}
          ${b.status === 'Confirmed' ? `<button class="act-btn act-complete" onclick="achangeStatus('${b.id}','Completed')">Done</button>` : ''}
          ${b.status === 'Pending' || b.status === 'Confirmed' ? `<button class="act-btn act-cancel" onclick="achangeStatus('${b.id}','Cancelled')">Cancel</button>` : ''}
        </div>
      </td>
    </tr>`;
  });
}

async function achangeStatus(id, status) {
  const res = await aapi('PATCH', `/api/bookings/${id}/status`, { status });
  if (res && res.error) { atoast(res.error, 'error'); return; }
  await aloadBookings(); await aloadRooms();
  arenderAllBookings(); arenderDashboard();
  atoast(`Booking ${id} updated to ${status}.`, 'success');
}

/* ===== MANAGE ROOMS TABLE ===== */
function arenderRoomsTable() {
  const tbody = document.getElementById('arooms-tbody');
  tbody.innerHTML = '';
  arooms.forEach(r => {
    tbody.innerHTML += `<tr>
      <td><strong>${r.id}</strong></td>
      <td>${r.name}</td><td>${r.type}</td><td>${r.floor}</td>
      <td>${r.cap}</td><td>₱${(r.rate || 0).toLocaleString()}</td>
      <td><span class="badge badge-${r.status === 'Available' ? 'confirmed' : r.status === 'Occupied' ? 'pending' : 'cancelled'}">${r.status}</span></td>
      <td>${r.rating ? '★ ' + r.rating : '—'}</td>
      <td>
        <div style="display:flex;gap:.4rem">
          <button class="act-btn" onclick="aopenManageRoomModal('${r.id}')"><i class='bx bx-edit-alt'></i> Edit</button>
          <button class="act-btn act-cancel" onclick="adeleteRoom('${r.id}')"><i class='bx bx-trash'></i></button>
        </div>
      </td>
    </tr>`;
  });
}

async function adeleteRoom(id) {
  if (!confirm(`Delete room ${id}? This cannot be undone.`)) return;
  const res = await aapi('DELETE', `/api/rooms/${id}`);
  if (res && res.error) { atoast(res.error, 'error'); return; }
  await aloadRooms(); arenderRoomsTable();
  atoast(`Room ${id} deleted.`, 'success');
}

/* ===== ROOM MODAL ===== */
function aopenAddRoomModal() {
  aisAddingRoom = true; aeditingRoomId = null; amrCurrentPhotos = [];
  document.getElementById('amr-mode-label').textContent = 'ADD ROOM';
  document.getElementById('amanage-room-title').textContent = 'Add New Room';
  ['amr-id', 'amr-name', 'amr-floor', 'amr-rate', 'amr-cap', 'amr-desc', 'amr-amenities', 'amr-inside'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('amr-id').readOnly = false;
  document.getElementById('amr-type').value = 'Standard';
  document.getElementById('amr-status').value = 'Available';
  const w = document.getElementById('amr-status-wrap'); if (w) w.style.display = 'none';
  amrRenderPhotos();
  document.getElementById('amanage-room-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function aopenManageRoomModal(id) {
  const r = arooms.find(x => x.id === id); if (!r) return;
  aisAddingRoom = false; aeditingRoomId = id;
  amrCurrentPhotos = (r.gallery && r.gallery.length ? r.gallery : (r.img ? [r.img] : [])).map(s => ({ src: s }));
  document.getElementById('amr-mode-label').textContent = 'MANAGE ROOM';
  document.getElementById('amanage-room-title').textContent = `Edit Room — Rm. ${r.id}: ${r.name}`;
  document.getElementById('amr-id').value = r.id;
  document.getElementById('amr-id').readOnly = true;
  document.getElementById('amr-name').value = r.name;
  document.getElementById('amr-type').value = r.type;
  document.getElementById('amr-floor').value = r.floor || '';
  document.getElementById('amr-status').value = r.status || 'Available';
  document.getElementById('amr-rate').value = r.rate;
  document.getElementById('amr-cap').value = r.cap;
  document.getElementById('amr-desc').value = r.desc || r.desc_text || '';
  document.getElementById('amr-amenities').value = (r.amenities || []).join(', ');
  const insideArr = r.inside || [];
  document.getElementById('amr-inside').value = insideArr.map(i => i.replace(/<[^>]+>/g, '').trim()).join('\n');
  const w = document.getElementById('amr-status-wrap'); if (w) w.style.display = '';
  amrRenderPhotos();
  document.getElementById('amanage-room-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function acloseManageRoomModal(e) {
  if (e && e.target !== document.getElementById('amanage-room-modal')) return;
  document.getElementById('amanage-room-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function amrRenderPhotos() {
  const grid = document.getElementById('amr-photo-preview'); if (!grid) return;
  if (!amrCurrentPhotos.length) { grid.innerHTML = '<div style="color:var(--text-muted);font-size:.82rem;padding:.5rem">No photos yet. Click "Add Photo" to upload.</div>'; return; }
  grid.innerHTML = amrCurrentPhotos.map((p, i) => `
    <div class="mr-photo-item">
      <img src="${p.src}" alt="Photo ${i + 1}" />
      <button class="mr-photo-delete" onclick="amrRemovePhoto(${i})" title="Delete"><i class='bx bx-trash'></i></button>
      ${i === 0 ? '<span class="mr-photo-main">Main</span>' : ''}
    </div>`).join('');
}

function amrHandleUpload(input) {
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => { amrCurrentPhotos.push({ src: e.target.result }); amrRenderPhotos(); };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function amrRemovePhoto(idx) { amrCurrentPhotos.splice(idx, 1); amrRenderPhotos(); }

async function asaveRoomChanges() {
  const rid = document.getElementById('amr-id').value.trim();
  const name = document.getElementById('amr-name').value.trim();
  const type = document.getElementById('amr-type').value;
  const floor = document.getElementById('amr-floor').value.trim();
  const statusEl = document.getElementById('amr-status');
  const status = statusEl ? statusEl.value : 'Available';
  const rate = parseInt(document.getElementById('amr-rate').value);
  const cap = parseInt(document.getElementById('amr-cap').value);
  const desc = document.getElementById('amr-desc').value.trim();
  const amenities = document.getElementById('amr-amenities').value.split(',').map(s => s.trim()).filter(Boolean);
  const insideLines = (document.getElementById('amr-inside').value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const inside = insideLines.map(line => `<i class="bx bx-check-circle"></i> ${line}`);
  if (!name) { atoast('Room name cannot be empty.', 'error'); return; }
  if (!rate || rate < 0) { atoast('Please enter a valid rate.', 'error'); return; }
  if (!cap || cap < 1) { atoast('Capacity must be at least 1.', 'error'); return; }
  // Upload base64 photos
  const resolvedPhotos = [];
  for (const p of amrCurrentPhotos) {
    if (p.src.startsWith('data:')) {
      const res = await aapi('POST', '/api/upload-image', { dataUrl: p.src, filename: 'room.png' });
      resolvedPhotos.push(res.url || p.src);
    } else { resolvedPhotos.push(p.src); }
  }
  const mainImg = resolvedPhotos[0] || 'images/1.png';
  if (aisAddingRoom) {
    if (!rid) { atoast('Room ID cannot be empty.', 'error'); return; }
    const res = await aapi('POST', '/api/rooms', { id: rid, name, type, floor, cap, rate, status, rating: 0, img: mainImg, gallery: resolvedPhotos, amenities, desc, inside });
    if (res.error) { atoast(res.error, 'error'); return; }
    atoast(`Room ${rid} added!`, 'success');
  } else {
    const res = await aapi('PUT', `/api/rooms/${aeditingRoomId}`, { name, type, floor, status, rate, cap, desc, amenities, gallery: resolvedPhotos, img: mainImg, inside });
    if (res.error) { atoast(res.error, 'error'); return; }
    atoast('Room updated!', 'success');
  }
  document.getElementById('amanage-room-modal').style.display = 'none';
  document.body.style.overflow = '';
  aeditingRoomId = null; aisAddingRoom = false;
  await aloadRooms(); arenderRoomsTable();
}

/* ===== SETTINGS ===== */
function aloadSettings() {
  if (!adminUser) return;
  document.getElementById('aset-fname').value = adminUser.fname || '';
  document.getElementById('aset-lname').value = adminUser.lname || '';
  document.getElementById('aset-email').value = adminUser.email || '';
  document.getElementById('aset-phone').value = adminUser.phone || '';
}

async function asaveProfile() {
  const fname = document.getElementById('aset-fname').value.trim();
  const lname = document.getElementById('aset-lname').value.trim();
  const email = document.getElementById('aset-email').value.trim();
  const phone = document.getElementById('aset-phone').value.trim();
  const res = await aapi('PUT', '/api/me', { fname, lname, email, phone });
  if (res.error) { atoast(res.error, 'error'); return; }
  adminUser = res;
  document.getElementById('admin-name').textContent = `${adminUser.fname} ${adminUser.lname}`;
  atoast('Profile updated!', 'success');
}

async function achangePassword() {
  const old = document.getElementById('aset-oldpw').value;
  const nw = document.getElementById('aset-newpw').value;
  const cp = document.getElementById('aset-cpw').value;
  if (!old || !nw || !cp) { atoast('Please fill in all password fields.', 'error'); return; }
  if (nw.length < 6) { atoast('New password must be at least 6 characters.', 'error'); return; }
  if (nw !== cp) { atoast('Passwords do not match.', 'error'); return; }
  const res = await aapi('PUT', '/api/me/password', { old, new: nw });
  if (res.error) { atoast(res.error, 'error'); return; }
  ['aset-oldpw', 'aset-newpw', 'aset-cpw'].forEach(id => document.getElementById(id).value = '');
  atoast('Password changed!', 'success');
}

/* ===== INIT ===== */
window.onload = async function () {
  if (_atoken) {
    try {
      const me = await aapi('GET', '/api/me');
      if (me && me.email && me.role === 'Admin') {
        adminUser = me;
        await Promise.all([aloadRooms(), aloadBookings()]);
        document.getElementById('admin-auth-section').style.display = 'none';
        document.getElementById('admin-app-section').classList.remove('hidden');
        const av = (adminUser.fname[0] + (adminUser.lname ? adminUser.lname[0] : '')).toUpperCase();
        document.getElementById('admin-avatar').textContent = av;
        document.getElementById('admin-name').textContent = `${adminUser.fname} ${adminUser.lname}`;
        document.getElementById('admin-topbar-name').textContent = adminUser.fname;
        ashowPage('dashboard');
        return;
      }
    } catch (e) { }
    _atoken = ''; localStorage.removeItem('nx_admin_token');
  }
};
