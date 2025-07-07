from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, login_user, login_required, logout_user, UserMixin, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import hashlib
from datetime import timedelta, datetime
import re
import json
from collections import deque
from flask_wtf import CSRFProtect

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+mysqldb://root:root@127.0.0.1:3306/chatroom_db?charset=utf8mb4'
db = SQLAlchemy(app)
csrf = CSRFProtect(app)
socketio = SocketIO(app, cors_allowed_origins=[
         "https://beconversive.in",
         "https://www.beconversive.in",
         "http://localhost:5000",
         "http://127.0.0.1:5000"
     ])
login_manager = LoginManager(app)
login_manager.login_view = 'login'

ADMIN_PASSWORD = 'supersecretadminpass'  # Change this to your desired admin password

# Music queue system
music_queue = deque()
current_song = None
is_playing = False

# Bollywood Romantic Songs Library
MUSIC_LIBRARY = {
    'Fer Millange': {
        'title': 'Fer Millange',
        'url': 'https://www.youtube.com/watch?v=DLZD47lj82o',
        'duration': 260,
        'artist': ''
    },
    'Sahiba': {
        'title': 'Sahiba',
        'url': 'https://www.youtube.com/watch?v=n2dVFdqMYGA',
        'duration': 300,
        'artist': ''
    },
    'Par Ab Jo Aayegi Tu by AUR': {
        'title': 'Par Ab Jo Aayegi Tu by AUR',
        'url': 'https://www.youtube.com/watch?v=DAA0Xb8bDMc',
        'duration': 280,
        'artist': ''
    },
    'Afusic - Pal Pal': {
        'title': 'Afusic - Pal Pal',
        'url': 'https://www.youtube.com/watch?v=AbkEmIgJMcU',
        'duration': 320,
        'artist': ''
    },
    'tere_sang_yaara': {
        'title': 'Tere Sang Yaara - Rustom',
        'url': 'https://www.youtube.com/watch?v=7HDeem-JaSY',
        'duration': 260,
        'artist': ''
    },
    'kal_ho_na_ho': {
        'title': 'Kal Ho Naa Ho - Title Track',
        'url': 'https://www.youtube.com/watch?v=7HDeem-JaSY',
        'duration': 310,
        'artist': ''
    },
    'Maand': {
        'title': 'Maand',
        'url': 'https://www.youtube.com/watch?v=hAllPDaZkBo',
        'duration': 185,
        'artist': ''
    },
    'Dooron Dooron': {
        'title': 'Dooron Dooron',
        'url': 'https://www.youtube.com/watch?v=9T-Zbxg9X_4',
        'duration': 366,
        'artist': ''
    }
}

# User model
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    mobile = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), default='pending')

# Message model
class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, server_default=db.func.now())
    user = db.relationship('User')

# User loader for Flask-Login
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


@app.route('/')
def home():
    return redirect(url_for('login'))


# Registration route
@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    if request.method == 'POST':
        email = request.form['email']
        mobile = request.form['mobile']
        password = request.form['password']
        
        # Check if email already exists
        if User.query.filter_by(email=email).first():
            return render_template('email_exists.html', email=email)
        
        # Check if mobile already exists
        if User.query.filter_by(mobile=mobile).first():
            return render_template('mobile_exists.html', mobile=mobile)
        
        hashed_pw = generate_password_hash(password)
        user = User(email=email, mobile=mobile, password=hashed_pw, status='pending')
        db.session.add(user)
        db.session.commit()
        return render_template('registration_success.html')
    return render_template('login.html')

# Login route
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    if request.method == 'POST':
        identifier = request.form['identifier'].strip()
        password = request.form['password']
        user = None
        if '@' in identifier:
            user = User.query.filter_by(email=identifier).first()
        else:
            user = User.query.filter_by(mobile=identifier).first()
        if user and check_password_hash(user.password, password):
            if user.status != 'approved':
                return render_template('not_approved.html')
            login_user(user)
            session.permanent = True
            return redirect(url_for('chat'))
        return render_template('invalid_credentials.html')
    return render_template('login.html')

# Logout route
@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# Chat room route
@app.route('/chat')
@login_required
def chat():
    return render_template('chat.html')

@app.route('/get_username')
@login_required
def get_username():
    return jsonify({'username': current_user.email})

def get_avatar_color(email):
    # Pick a color from a fixed palette based on email hash
    colors = [
        '#6a11cb', '#2575fc', '#ff6f61', '#43cea2', '#f7971e', '#f953c6', '#30cfd0', '#667eea', '#fc5c7d', '#00c3ff'
    ]
    idx = int(hashlib.md5(email.encode()).hexdigest(), 16) % len(colors)
    return colors[idx]

def contains_script_or_event(msg):
    # Block <script>, <img ... onerror=, <svg ... onload=, javascript: etc.
    pattern = re.compile(
        r'(<\s*script|onerror\s*=|onload\s*=|javascript:|<\s*svg|<\s*iframe|<\s*object|<\s*embed|<\s*link|<\s*meta)',
        re.IGNORECASE
    )
    return bool(pattern.search(msg))

def contains_html_tags(msg):
    # Check if message contains HTML tags (not just < and > characters)
    # This allows emojis but blocks actual HTML
    pattern = re.compile(r'<[^>]*>')
    return bool(pattern.search(msg))

# SocketIO event for sending/receiving messages 
@socketio.on('send_message')
def handle_send_message(data):
    if not current_user.is_authenticated:
        return
    message = data['message']
    # Block HTML tags and script injection, but allow emojis
    if contains_html_tags(message) or contains_script_or_event(message):
        return  # Block the message
    msg = Message(user_id=current_user.id, content=message)
    db.session.add(msg)
    db.session.commit()
    emit('receive_message', {
        'username': current_user.email,
        'initial': current_user.email[0].upper(),
        'color': get_avatar_color(current_user.email),
        'message': message,
        'timestamp': msg.timestamp.strftime('%Y-%m-%d %H:%M:%S')
    }, broadcast=True)

@socketio.on('request_music')
def handle_music_request(data):
    if not current_user.is_authenticated:
        return
    
    song_id = data.get('song_id')
    if song_id not in MUSIC_LIBRARY:
        emit('music_error', {'message': 'Song not found'})
        return
    
    song = MUSIC_LIBRARY[song_id]
    song_request = {
        'id': song_id,
        'title': song['title'],
        'url': song['url'],
        'duration': song['duration'],
        'requested_by': current_user.email,
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    # Add to queue
    music_queue.append(song_request)
    
    # If nothing is playing, start playing
    global current_song, is_playing
    if not is_playing:
        play_next_song()
    else:
        # Notify everyone about the new song in queue
        emit('music_queue_updated', {
            'queue': list(music_queue),
            'current_song': current_song
        }, broadcast=True)
    
    # Notify the requester
    emit('music_request_success', {
        'message': f'Added "{song["title"]}" to queue',
        'position': len(music_queue)
    })

@socketio.on('skip_song')
def handle_skip_song():
    if not current_user.is_authenticated:
        return
    
    global current_song, is_playing
    if is_playing:
        play_next_song()
        emit('music_skipped', {
            'message': f'Song skipped by {current_user.email}'
        }, broadcast=True)

@socketio.on('get_music_status')
def handle_get_music_status():
    if not current_user.is_authenticated:
        return
    
    emit('music_status', {
        'current_song': current_song,
        'is_playing': is_playing,
        'queue': list(music_queue)
    })

def play_next_song():
    global current_song, is_playing
    
    if music_queue:
        current_song = music_queue.popleft()
        is_playing = True
        
        # Notify everyone about the new song
        socketio.emit('music_started', {
            'song': current_song
        })
        
        # Also update the queue display
        socketio.emit('music_queue_updated', {
            'queue': list(music_queue),
            'current_song': current_song
        })
        
        # Schedule next song
        socketio.sleep(current_song['duration'])
        play_next_song()
    else:
        current_song = None
        is_playing = False
        socketio.emit('music_stopped', {
            'message': 'No more songs in queue'
        })
        
        # Clear the queue display
        socketio.emit('music_queue_updated', {
            'queue': [],
            'current_song': None
        })

def is_admin():
    return session.get('is_admin', False)

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        password = request.form['password']
        if password == ADMIN_PASSWORD:
            session['is_admin'] = True
            return redirect(url_for('admin_pending'))
        else:
            flash('Incorrect admin password!')
    return render_template('admin_login.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('is_admin', None)
    return redirect(url_for('admin_login'))

@app.route('/admin/pending')
def admin_pending():
    if not is_admin():
        return redirect(url_for('admin_login'))
    users = User.query.filter_by(status='pending').all()
    return render_template('admin_pending.html', users=users)

@app.route('/admin/approve/<int:user_id>')
def admin_approve(user_id):
    if not is_admin():
        return redirect(url_for('admin_login'))
    user = User.query.get(user_id)
    if user:
        user.status = 'approved'
        db.session.commit()
    return redirect(url_for('admin_pending'))

@app.route('/admin/reject/<int:user_id>')
def admin_reject(user_id):
    if not is_admin():
        return redirect(url_for('admin_login'))
    user = User.query.get(user_id)
    if user:
        user.status = 'rejected'
        db.session.commit()
    return redirect(url_for('admin_pending'))

@app.route('/messages')
@login_required
def get_messages():
    messages = Message.query.order_by(Message.timestamp.asc()).limit(100).all()
    result = []
    for msg in messages:
        result.append({
            'username': msg.user.email,
            'initial': msg.user.email[0].upper(),
            'color': get_avatar_color(msg.user.email),
            'message': msg.content,
            'timestamp': msg.timestamp.strftime('%Y-%m-%d %H:%M:%S')
        })
    return jsonify(result)

app.permanent_session_lifetime = timedelta(days=7)

if __name__ == '__main__':
    socketio.run(app, debug=True) 