"""
NexStay Hotel - Python Flask Backend
"""
import os, json, secrets, base64
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3

try:
    from whitenoise import WhiteNoise
    _whitenoise_available = True
except ImportError:
    _whitenoise_available = False

app = Flask(__name__, static_folder='.' if not _whitenoise_available else None)
CORS(app)

if _whitenoise_available:
    app.wsgi_app = WhiteNoise(app.wsgi_app, root=os.path.dirname(os.path.abspath(__file__)), prefix='')


# Absolute path to the project root - works correctly on Render & locally
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'nexstay.db')

_tokens = {}   # token -> user_id (in-memory session store)
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'images', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- DB helpers -------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def row_to_dict(r):
    return dict(r) if r else None

def rows_to_list(rs):
    return [dict(r) for r in rs]

# --- Auth helper ------------------------------------------------------------------
def auth_user():
    h = request.headers.get('Authorization', '')
    token = h.replace('Bearer ', '').strip()
    uid = _tokens.get(token)
    if not uid:
        return None
    conn = get_db()
    u = row_to_dict(conn.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone())
    conn.close()
    return u

def is_admin(u):
    return u and (u.get('role') == 'Admin' or u.get('email') in ('sofia@email.com', 'jeriel@gmail.com'))

def safe_user(u):
    return {k: v for k, v in u.items() if k != 'pw'}

# --- Init DB ----------------------------------------------------------------------
def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fname TEXT, lname TEXT, email TEXT UNIQUE,
            phone TEXT, pw TEXT, role TEXT DEFAULT 'Guest'
        );
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY, name TEXT, type TEXT, floor TEXT,
            cap INTEGER, rate INTEGER, status TEXT DEFAULT 'Available',
            rating REAL, img TEXT, desc_text TEXT,
            amenities TEXT, inside_items TEXT, gallery TEXT
        );
        CREATE TABLE IF NOT EXISTS bookings (
            id TEXT PRIMARY KEY, guest TEXT, email TEXT, phone TEXT,
            room TEXT, type TEXT, floor TEXT, cap TEXT,
            rate INTEGER, checkin TEXT, checkout TEXT,
            nights INTEGER, total INTEGER, status TEXT DEFAULT 'Confirmed',
            notes TEXT, booked_by TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT, user_email TEXT, user_name TEXT,
            rating INTEGER, comment TEXT, booking_id TEXT,
            created_at TEXT
        );
    ''')

    # Seed admin users
    for u in [
        ('Sofia','Dafers','sofia@email.com','09123456789','sofia123','Admin'),
        ('Jeriel','Admin','jeriel@gmail.com','09000000000','jeriel123','Admin')
    ]:
        try:
            c.execute("INSERT INTO users (fname,lname,email,phone,pw,role) VALUES (?,?,?,?,?,?)", u)
        except: pass

    # Seed rooms
    rooms_seed = [
        ('101','The Heritage Room','Standard','Floor 1',2,1500,'Available',4.8,'images/1.png',
         'A tastefully decorated standard room with a warm and inviting atmosphere.',
         json.dumps(['WiFi','TV','AC','Mini-bar']),
         json.dumps(['<i class="bx bx-bed"></i> Queen Bed','<i class="bx bx-tv"></i> 42" Smart TV','<i class="bx bx-wind"></i> Air Conditioning','<i class="bx bx-water"></i> Rain Shower']),
         json.dumps(['images/1.png','images/1a.png','images/1b.png'])),
        ('201','The Prestige Suite','Suite','Floor 2',2,5000,'Available',5.0,'images/2.png',
         'An exquisite suite offering panoramic city views and world-class amenities.',
         json.dumps(['WiFi','TV','AC','Jacuzzi','City View','Mini-bar']),
         json.dumps(['<i class="bx bx-bed"></i> King Bed','<i class="bx bx-bath"></i> Jacuzzi Tub','<i class="bx bx-tv"></i> 65" Smart TV']),
         json.dumps(['images/2.png','images/2a.png','images/2b.png'])),
        ('202','The Serenity Deluxe','Deluxe','Floor 2',2,2500,'Available',4.9,'images/3.png',
         'A sophisticated deluxe room blending elegance with modern comfort.',
         json.dumps(['WiFi','TV','AC','Mini-bar','Sofa Bed']),
         json.dumps(['<i class="bx bx-bed"></i> King Bed','<i class="bx bx-tv"></i> 55" Smart TV','<i class="bx bx-bath"></i> Spa Shower']),
         json.dumps(['images/3.png','images/3a.png','images/3b.png'])),
        ('301','The Executive Chamber','Deluxe','Floor 3',3,3000,'Available',4.9,'images/4.png',
         'A refined executive room built for up to 3 guests with a dedicated workspace.',
         json.dumps(['WiFi','TV','AC','Mini-bar','Sofa','Work Desk']),
         json.dumps(['<i class="bx bx-bed"></i> King Bed + Sofa Bed','<i class="bx bx-chair"></i> Executive Sofa','<i class="bx bx-desktop"></i> Work Desk']),
         json.dumps(['images/4.png','images/4a.png','images/4b.png']))
    ]
    for r in rooms_seed:
        try:
            c.execute("INSERT INTO rooms VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", r)
        except: pass

    conn.commit()
    conn.close()

# --- Static files ---------------------------------------------------------------
def _serve_html(filename):
    """Read and serve an HTML file directly, bypassing Flask static routing."""
    from flask import Response
    path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(path):
        return Response('Not found', status=404)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    return Response(content, mimetype='text/html')

@app.route('/')
def index():
    return _serve_html('index.html')

@app.route('/admin')
@app.route('/admin/')
def admin_portal():
    return _serve_html('admin.html')

@app.route('/<path:filename>')
def serve_static_files(filename):
    """Serve any static file (css, js, images) using absolute path."""
    full_path = os.path.join(BASE_DIR, filename)
    if os.path.exists(full_path):
        return send_from_directory(BASE_DIR, filename)
    return ('Not found', 404)

@app.route('/images/<path:filename>')
def serve_image(filename):
    # Serve both images/ and images/uploads/
    full_path = os.path.join('images', filename)
    if os.path.exists(full_path):
        return send_from_directory('images', filename)
    return ('Not found', 404)

# --- AUTH ROUTES ----------------------------------------------------------------
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db()
    u = row_to_dict(conn.execute('SELECT * FROM users WHERE email=? AND pw=?',
                                 (data.get('email',''), data.get('pw',''))).fetchone())
    conn.close()
    if not u:
        return jsonify({'error': 'Invalid email or password.'}), 401
    token = secrets.token_hex(32)
    _tokens[token] = u['id']
    return jsonify({'token': token, 'user': safe_user(u)})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    conn = get_db()
    if conn.execute('SELECT id FROM users WHERE email=?', (data.get('email',''),)).fetchone():
        conn.close()
        return jsonify({'error': 'An account with this email already exists.'}), 409
    c = conn.cursor()
    c.execute("INSERT INTO users (fname,lname,email,phone,pw,role) VALUES (?,?,?,?,?,?)",
              (data['fname'], data['lname'], data['email'], data.get('phone',''), data['pw'], 'Guest'))
    uid = c.lastrowid
    conn.commit()
    u = row_to_dict(conn.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone())
    conn.close()
    token = secrets.token_hex(32)
    _tokens[token] = uid
    return jsonify({'token': token, 'user': safe_user(u)})

@app.route('/api/me', methods=['GET'])
def get_me():
    u = auth_user()
    if not u: return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(safe_user(u))

@app.route('/api/me', methods=['PUT'])
def update_profile():
    u = auth_user()
    if not u: return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    conn = get_db()
    conn.execute("UPDATE users SET fname=?,lname=?,email=?,phone=? WHERE id=?",
                 (data['fname'], data['lname'], data['email'], data.get('phone',''), u['id']))
    conn.commit()
    u2 = row_to_dict(conn.execute('SELECT * FROM users WHERE id=?', (u['id'],)).fetchone())
    conn.close()
    return jsonify(safe_user(u2))

@app.route('/api/me/password', methods=['PUT'])
def change_password():
    u = auth_user()
    if not u: return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    if u['pw'] != data.get('old'):
        return jsonify({'error': 'Current password is incorrect.'}), 400
    conn = get_db()
    conn.execute('UPDATE users SET pw=? WHERE id=?', (data['new'], u['id']))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# --- ROOMS ROUTES ---------------------------------------------------------------
def parse_room(r):
    for k in ('amenities', 'inside_items', 'gallery'):
        try: r[k] = json.loads(r.get(k) or '[]')
        except: r[k] = []
    r['inside'] = r.pop('inside_items', [])
    r['desc'] = r.pop('desc_text', '')
    return r

@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    conn = get_db()
    rs = rows_to_list(conn.execute('SELECT * FROM rooms').fetchall())
    conn.close()
    return jsonify([parse_room(r) for r in rs])

@app.route('/api/rooms', methods=['POST'])
def add_room():
    u = auth_user()
    if not u or not is_admin(u): return jsonify({'error': 'Admin only'}), 403
    data = request.json
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO rooms (id,name,type,floor,cap,rate,status,rating,img,desc_text,amenities,inside_items,gallery) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (data['id'], data['name'], data['type'], data.get('floor','Floor 1'),
             data.get('cap',2), data.get('rate',0), data.get('status','Available'),
             data.get('rating',4.5), data.get('img','images/1.png'),
             data.get('desc',''), json.dumps(data.get('amenities',[])),
             json.dumps(data.get('inside',[])), json.dumps(data.get('gallery',[]))))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Room ID already exists'}), 409
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/rooms/<rid>', methods=['PUT'])
def update_room(rid):
    u = auth_user()
    if not u or not is_admin(u): return jsonify({'error': 'Admin only'}), 403
    data = request.json
    conn = get_db()
    conn.execute(
        "UPDATE rooms SET name=?,type=?,floor=?,status=?,rate=?,cap=?,desc_text=?,amenities=?,inside_items=?,gallery=?,img=? WHERE id=?",
        (data['name'], data['type'], data.get('floor',''), data['status'],
         data['rate'], data['cap'],
         data.get('desc',''), json.dumps(data.get('amenities',[])),
         json.dumps(data.get('inside',[])),
         json.dumps(data.get('gallery',[])), data.get('img',''), rid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/rooms/<rid>', methods=['DELETE'])
def delete_room(rid):
    u = auth_user()
    if not u or not is_admin(u): return jsonify({'error': 'Admin only'}), 403
    conn = get_db()
    conn.execute('DELETE FROM rooms WHERE id=?', (rid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# --- IMAGE UPLOAD ---------------------------------------------------------------
@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    u = auth_user()
    if not u or not is_admin(u): return jsonify({'error': 'Admin only'}), 403
    data = request.json
    # Expect { dataUrl: 'data:image/png;base64,...', filename: 'myfile.png' }
    data_url = data.get('dataUrl','')
    filename = data.get('filename', 'upload.png')
    if not data_url.startswith('data:image'):
        return jsonify({'error': 'Invalid image data'}), 400
    # Decode base64
    header, b64 = data_url.split(',', 1)
    ext = header.split('/')[1].split(';')[0]
    safe_name = secrets.token_hex(8) + '.' + ext
    save_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(save_path, 'wb') as f:
        f.write(base64.b64decode(b64))
    return jsonify({'url': f'images/uploads/{safe_name}'})

# --- BOOKINGS ROUTES ------------------------------------------------------------
@app.route('/api/bookings', methods=['GET'])
def get_bookings():
    u = auth_user()
    if not u: return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    if is_admin(u):
        bs = rows_to_list(conn.execute('SELECT * FROM bookings ORDER BY created_at DESC').fetchall())
    else:
        bs = rows_to_list(conn.execute(
            'SELECT * FROM bookings WHERE booked_by=? OR email=? ORDER BY created_at DESC',
            (u['email'], u['email'])).fetchall())
    conn.close()
    return jsonify(bs)

@app.route('/api/bookings', methods=['POST'])
def create_booking():
    u = auth_user()
    if not u: return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    conn = get_db()
    conn.execute("UPDATE rooms SET status='Occupied' WHERE id=?", (data['room'],))
    conn.execute("INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (data['id'], data['guest'], data['email'], data['phone'],
                  data['room'], data['type'], data['floor'], data['cap'],
                  data['rate'], data['checkin'], data['checkout'],
                  data['nights'], data['total'], data.get('status','Confirmed'),
                  data.get('notes',''), u['email'], datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bookings/<bid>', methods=['PUT'])
def update_booking(bid):
    u = auth_user()
    if not u: return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    conn = get_db()
    old = row_to_dict(conn.execute('SELECT room FROM bookings WHERE id=?', (bid,)).fetchone())
    if old and old['room'] != data['room']:
        conn.execute("UPDATE rooms SET status='Available' WHERE id=?", (old['room'],))
        conn.execute("UPDATE rooms SET status='Occupied' WHERE id=?", (data['room'],))
    conn.execute("""UPDATE bookings SET guest=?,email=?,phone=?,room=?,type=?,
                    floor=?,cap=?,rate=?,checkin=?,checkout=?,nights=?,total=?,notes=?
                    WHERE id=?""",
                 (data['guest'], data['email'], data['phone'], data['room'], data['type'],
                  data['floor'], data['cap'], data['rate'], data['checkin'], data['checkout'],
                  data['nights'], data['total'], data.get('notes',''), bid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bookings/<bid>/status', methods=['PATCH'])
def change_status(bid):
    u = auth_user()
    if not u: return jsonify({'error': 'Unauthorized'}), 401
    status = request.json.get('status')
    conn = get_db()
    bk = row_to_dict(conn.execute('SELECT * FROM bookings WHERE id=?', (bid,)).fetchone())
    if not bk: conn.close(); return jsonify({'error': 'Not found'}), 404
    if not is_admin(u) and (status != 'Cancelled' or bk['booked_by'] != u['email']):
        conn.close(); return jsonify({'error': 'Forbidden'}), 403
    conn.execute('UPDATE bookings SET status=? WHERE id=?', (status, bid))
    if status == 'Cancelled' or status == 'Completed':
        conn.execute("UPDATE rooms SET status='Available' WHERE id=?", (bk['room'],))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    u = auth_user()
    if not u or not is_admin(u): return jsonify({'error': 'Admin only'}), 403
    conn = get_db()
    bs = rows_to_list(conn.execute('SELECT * FROM bookings').fetchall())
    rs = rows_to_list(conn.execute('SELECT * FROM rooms').fetchall())
    conn.close()
    confirmed = [b for b in bs if b['status'] == 'Confirmed']
    return jsonify({
        'revenue': sum(b['total'] for b in confirmed),
        'confirmed': len(confirmed),
        'pending': len([b for b in bs if b['status'] == 'Pending']),
        'available': len([r for r in rs if r['status'] == 'Available']),
        'total_rooms': len(rs),
        'recent': list(reversed(bs[-5:]))
    })

# --- REVIEWS ROUTES -------------------------------------------------------------
@app.route('/api/rooms/<rid>/reviews', methods=['GET'])
def get_reviews(rid):
    conn = get_db()
    rs = rows_to_list(conn.execute(
        'SELECT * FROM reviews WHERE room_id=? ORDER BY created_at DESC', (rid,)).fetchall())
    conn.close()
    return jsonify(rs)

@app.route('/api/rooms/<rid>/reviews', methods=['POST'])
def add_review(rid):
    u = auth_user()
    if not u: return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    rating = int(data.get('rating', 0))
    comment = data.get('comment', '').strip()
    booking_id = data.get('booking_id', '')
    if not (1 <= rating <= 5): return jsonify({'error': 'Rating must be 1-5'}), 400
    conn = get_db()
    # Check if user has a booking for this room
    bk = conn.execute(
        "SELECT id FROM bookings WHERE room=? AND (email=? OR booked_by=?) AND status IN ('Confirmed','Completed')",
        (rid, u['email'], u['email'])).fetchone()
    if not bk and not is_admin(u):
        conn.close()
        return jsonify({'error': 'You must have a booking for this room to leave a review.'}), 403
    # Prevent duplicate review per booking
    if booking_id:
        dup = conn.execute('SELECT id FROM reviews WHERE booking_id=? AND user_email=?',
                           (booking_id, u['email'])).fetchone()
        if dup:
            conn.close()
            return jsonify({'error': 'You already reviewed this booking.'}), 409
    conn.execute("INSERT INTO reviews (room_id,user_email,user_name,rating,comment,booking_id,created_at) VALUES (?,?,?,?,?,?,?)",
                 (rid, u['email'], f"{u['fname']} {u['lname']}", rating, comment, booking_id, datetime.now().isoformat()))
    # Auto-recalculate room rating
    avg = conn.execute('SELECT AVG(rating) FROM reviews WHERE room_id=?', (rid,)).fetchone()[0]
    if avg: conn.execute('UPDATE rooms SET rating=? WHERE id=?', (round(avg, 1), rid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# --- Health check (used by Render to confirm app is alive) ----------------------
@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

# --- Startup --------------------------------------------------------------------
# init_db() is called at module level so Gunicorn triggers it on startup
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
