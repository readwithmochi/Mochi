// ════════════════════════════════════════════════════
// mochi.js — Supabase client, auth modal, shared data
// ════════════════════════════════════════════════════
(function () {

    const SUPABASE_URL = 'https://lividaycgvgbmsjzldqf.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpdmlkYXljZ3ZnYm1zanpsZHFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDQzNjUsImV4cCI6MjA5NDYyMDM2NX0.jF7rmn-022rpVQz0nlI_OnxzOx4o73Y7gxBHEJBiE2A';

    const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'mochi-auth',
        }
    });
    let _books = [];
    let _user = null;

    // Keep _user in sync whenever the session refreshes or changes
    _sb.auth.onAuthStateChange((event, session) => {
        if (session) _user = session.user;
        else _user = null;
    });

    // ── Column mapping ──────────────────────────────
    function _toDB(book) {
        return {
            id: book.id,
            user_id: _user.id,
            title: book.title,
            author: book.author,
            status: book.status,
            rating: book.rating !== undefined ? book.rating : null,
            tags: book.tags || [],
            notes: book.notes || '',
            favourite: book.favourite || false,
            cover_id: book.coverId !== undefined ? book.coverId : null,
            page_count: book.pageCount !== undefined ? book.pageCount : null,
            fallback_color: book.fallbackColor || null,
            date_added: book.dateAdded || Date.now(),
            date_finished: book.dateFinished !== undefined ? book.dateFinished : null,
            date_started: book.dateStarted !== undefined ? book.dateStarted : null,
            quotes: book.quotes || '',
            mood_tag: book.moodTag || '',
            current_page: book.currentPage !== undefined ? book.currentPage : null,
        };
    }

    function _fromDB(row) {
        return {
            id: row.id,
            title: row.title,
            author: row.author,
            status: row.status,
            rating: row.rating,
            tags: row.tags || [],
            notes: row.notes || '',
            favourite: row.favourite || false,
            coverId: row.cover_id,
            pageCount: row.page_count,
            fallbackColor: row.fallback_color,
            dateAdded: row.date_added,
            dateFinished: row.date_finished,
            dateStarted: row.date_started,
            quotes: row.quotes || '',
            moodTag: row.mood_tag || '',
            currentPage: row.current_page || null,
        };
    }

    // ── Public data API ─────────────────────────────
    window.mochiGetBooks = () => _books;
    window.mochiGetUser = () => _user;

    window.mochiLoadBooks = async () => {
        if (!_user) return _books;
        const { data, error } = await _sb
            .from('books')
            .select('*')
            .eq('user_id', _user.id)
            .order('date_added', { ascending: false });
        if (error) throw error;
        _books = (data || []).map(_fromDB);
        return _books;
    };

    window.mochiInsertBook = async (book) => {
        const { error } = await _sb.from('books').insert(_toDB(book));
        if (error) throw error;
    };

    window.mochiUpdateBook = async (book) => {
        const { error } = await _sb.from('books').update(_toDB(book)).eq('id', book.id);
        if (error) console.error('Mochi update error:', error);
    };

    window.mochiDeleteBook = async (id) => {
        const { error } = await _sb.from('books').delete().eq('id', id);
        if (error) console.error('Mochi delete error:', error);
    };

    window.mochiGetBookById = async (id) => {
        const cached = _books.find(b => b.id === id);
        if (cached) return cached;
        if (!_books.length) await window.mochiLoadBooks();
        const retry = _books.find(b => b.id === id);
        if (retry) return retry;
        const { data, error } = await _sb.from('books').select('*').eq('id', id).limit(1);
        if (error) throw error;
        if (!data || !data.length) throw new Error('Book not found');
        return _fromDB(data[0]);
    };

    window.mochiSignOut = async () => {
        await _sb.auth.signOut();
        window.location.reload();
    };

    window.mochiUpdateNickname = async (nickname) => {
        const { data, error } = await _sb.auth.updateUser({ data: { nickname } });
        if (error) throw error;
        _user = data.user;
    };

    window.mochiDeleteAccount = async () => {
        await _sb.from('books').delete().eq('user_id', _user.id);
        await _sb.auth.signOut();
    };

    window.mochiGetGoal = () => {
        const year = new Date().getFullYear();
        return _user?.user_metadata?.[`goal_${year}`] || null;
    };

    window.mochiSetGoal = async (count) => {
        const year = new Date().getFullYear();
        const { data, error } = await _sb.auth.updateUser({ data: { [`goal_${year}`]: count } });
        if (error) throw error;
        _user = data.user;
    };

    // ── Mochi Pro (prototype — no real payment yet, just a flag) ──
    window.mochiIsPremium = () => !!_user?.user_metadata?.is_premium;

    window.mochiSetPremium = async (isPremium) => {
        const { data, error } = await _sb.auth.updateUser({ data: { is_premium: isPremium } });
        if (error) throw error;
        _user = data.user;
    };

    window.mochiGetRoomTheme = () => _user?.user_metadata?.room_theme || 'cottage';

    window.mochiSetRoomTheme = async (theme) => {
        const { data, error } = await _sb.auth.updateUser({ data: { room_theme: theme } });
        if (error) throw error;
        _user = data.user;
        try { localStorage.setItem('mochi-companion', theme); } catch (_) {}
        _applyCompanionTheme(theme);
    };

    // ── Companion theme (site-wide palette) ─────────
    const _COMPANION_PALETTES = {
        lavender: {
            '--pink-soft': '#241B2E', '--pink-light': '#4A3560', '--pink': '#8B6BB8', '--pink-deep': '#9575CD',
            '--text': '#EDE4F5', '--text-muted': '#B49BC9', '--border': '#3D2E4D', '--surface': '#2A2035',
            body: '#17111E',
            // Luna is the only dark theme: pages hardcode some white backgrounds, darken those here
            extra: `
                :root[data-companion="lavender"] { color-scheme: dark; }
                :root[data-companion="lavender"] header { background: rgba(23,17,30,0.92); }
                :root[data-companion="lavender"] input:focus,
                :root[data-companion="lavender"] textarea:focus,
                :root[data-companion="lavender"] select:focus { background: var(--surface); }
                :root[data-companion="lavender"] .book-modal { background: var(--surface); }
            `,
        },
        sage: {
            '--pink-soft': '#F1EDE3', '--pink-light': '#D9CBAE', '--pink': '#7A9B74', '--pink-deep': '#5E7D58',
            '--text': '#3A3226', '--text-muted': '#8A7D68', '--border': '#E4D9C2', '--surface': '#FFFDF8',
            body: '#FBF7EE',
        },
        golden: {
            '--pink-soft': '#FFF3D6', '--pink-light': '#F0CE85', '--pink': '#E0A030', '--pink-deep': '#C2801A',
            '--text': '#4A3018', '--text-muted': '#A0805A', '--border': '#F0DBA0', '--surface': '#FFFDF5',
            body: '#FFF9EA',
        },
    };
    const _COMPANION_ICONS = { cottage: '✦', lavender: '🌙', sage: '🍃', golden: '⭐' };

    let _themeStyleEl = null;

    function _applyCompanionTheme(companion) {
        document.documentElement.dataset.companion = companion;

        const palette = _COMPANION_PALETTES[companion];
        if (!_themeStyleEl) {
            _themeStyleEl = document.createElement('style');
            document.head.appendChild(_themeStyleEl);
        }
        if (palette) {
            const vars = Object.keys(palette).filter(k => k.startsWith('--')).map(k => `${k}: ${palette[k]};`).join(' ');
            _themeStyleEl.textContent = `
                :root[data-companion="${companion}"] { ${vars} }
                :root[data-companion="${companion}"] body { background: ${palette.body}; }
                ${palette.extra || ''}
            `;
        } else {
            _themeStyleEl.textContent = '';
        }

        const proLink = document.querySelector('nav a[href="premium.html"]');
        if (proLink) {
            proLink.textContent = proLink.textContent.replace(/^\S+/, _COMPANION_ICONS[companion] || '✦');
        }
    }

    // ── Styles ──────────────────────────────────────
    function _injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
            #mochiAuthOverlay {
                position: fixed; inset: 0; z-index: 9999;
                background: rgba(74,48,64,0.55);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                display: flex; align-items: center; justify-content: center;
                padding: 20px;
            }
            .mochi-auth-card {
                background: #fff; border-radius: 28px;
                width: 100%; max-width: 400px;
                padding: 40px 32px;
                box-shadow: 0 24px 80px rgba(74,48,64,0.22);
                font-family: 'Nunito', sans-serif;
            }
            .mochi-auth-bunny { font-size: 3rem; display: block; text-align: center; margin-bottom: 12px; }
            .mochi-auth-title {
                font-family: 'Playfair Display', serif;
                font-size: 1.7rem; font-weight: 700;
                color: #4A3040; text-align: center; margin-bottom: 5px;
            }
            .mochi-auth-sub { font-size: 0.83rem; color: #9B7B8A; text-align: center; margin-bottom: 26px; }
            .mochi-auth-tabs {
                display: flex; gap: 5px;
                background: #FAE8EF; border-radius: 12px;
                padding: 4px; margin-bottom: 22px;
            }
            .mochi-auth-tab {
                flex: 1; padding: 9px; border: none; border-radius: 8px;
                font-family: 'Nunito', sans-serif; font-size: 0.83rem; font-weight: 700;
                color: #9B7B8A; background: transparent; cursor: pointer; transition: all 0.2s;
            }
            .mochi-auth-tab.active {
                background: #fff; color: #C97A8E;
                box-shadow: 0 2px 8px rgba(201,122,142,0.15);
            }
            .mochi-auth-field { margin-bottom: 14px; }
            .mochi-auth-field label {
                display: block; font-size: 0.72rem; font-weight: 700;
                color: #9B7B8A; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px;
            }
            .mochi-auth-field input {
                width: 100%; background: #FAE8EF; border: 1.5px solid #F0DDE5;
                border-radius: 12px; padding: 12px 14px;
                font-family: 'Nunito', sans-serif; font-size: 0.9rem;
                color: #4A3040; outline: none; transition: border-color 0.2s;
            }
            .mochi-auth-field input:focus { border-color: #E8A0B4; background: #fff; }
            .mochi-auth-btn {
                width: 100%; padding: 14px;
                background: #C97A8E; color: #fff; border: none;
                border-radius: 14px; font-family: 'Nunito', sans-serif;
                font-size: 0.9rem; font-weight: 700; cursor: pointer;
                transition: all 0.2s; margin-top: 6px;
            }
            .mochi-auth-btn:hover { background: #b8697d; }
            .mochi-auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
            .mochi-auth-msg {
                border-radius: 10px; padding: 10px 14px;
                font-size: 0.8rem; font-weight: 600;
                margin-top: 12px; display: none; text-align: center;
            }
            .mochi-auth-msg.show { display: block; }
            .mochi-auth-msg.error { background: #FFF0F0; color: #C05050; }
            .mochi-auth-msg.success { background: #F0FAF4; color: #2A8050; }
            .mochi-signout-btn {
                font-size: 0.8rem; font-weight: 600; color: #9B7B8A;
                background: none; border: none; cursor: pointer;
                padding: 7px 14px; border-radius: 10px;
                font-family: 'Nunito', sans-serif; transition: all 0.2s;
            }
            .mochi-signout-btn:hover { background: #FAE8EF; color: #C97A8E; }

            /* Phones: 6 nav links don't fit — keep the bunny, let the links swipe sideways */
            @media (max-width: 640px) {
                header { gap: 10px; }
                header .logo-wordmark { display: none; }
                header nav {
                    flex: 1; min-width: 0;
                    overflow-x: auto; flex-wrap: nowrap;
                    scrollbar-width: none; -webkit-overflow-scrolling: touch;
                    -webkit-mask-image: linear-gradient(90deg, #000 85%, transparent);
                            mask-image: linear-gradient(90deg, #000 85%, transparent);
                }
                header nav::-webkit-scrollbar { display: none; }
                header nav a { white-space: nowrap; flex-shrink: 0; }
            }
        `;
        document.head.appendChild(s);
    }

    // ── Auth modal ──────────────────────────────────
    function _showAuthModal() {
        const overlay = document.createElement('div');
        overlay.id = 'mochiAuthOverlay';
        overlay.innerHTML = `
            <div class="mochi-auth-card">
                <span class="mochi-auth-bunny">🐰</span>
                <div class="mochi-auth-title">Welcome to Mochi</div>
                <div class="mochi-auth-sub">Your cozy reading world awaits 🌸</div>
                <div class="mochi-auth-tabs">
                    <button class="mochi-auth-tab active" id="_authTabLogin">Log in</button>
                    <button class="mochi-auth-tab" id="_authTabSignup">Sign up</button>
                </div>
                <div class="mochi-auth-field" id="_nameField" style="display:none">
                    <label>Nickname</label>
                    <input type="text" id="_authName" placeholder="" autocomplete="given-name">
                </div>
                <div class="mochi-auth-field">
                    <label>Email</label>
                    <input type="email" id="_authEmail" placeholder="your@email.com" autocomplete="email">
                </div>
                <div class="mochi-auth-field">
                    <label>Password</label>
                    <input type="password" id="_authPassword" placeholder="••••••••" autocomplete="current-password">
                </div>
                <button class="mochi-auth-btn" id="_authSubmit">Log in</button>
                <div class="mochi-auth-msg" id="_authMsg"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        let mode = 'login';

        document.getElementById('_authTabLogin').addEventListener('click', () => {
            mode = 'login';
            document.getElementById('_authTabLogin').classList.add('active');
            document.getElementById('_authTabSignup').classList.remove('active');
            document.getElementById('_authSubmit').textContent = 'Log in';
            document.getElementById('_authMsg').classList.remove('show', 'error', 'success');
            document.getElementById('_nameField').style.display = 'none';
        });

        document.getElementById('_authTabSignup').addEventListener('click', () => {
            mode = 'signup';
            document.getElementById('_authTabSignup').classList.add('active');
            document.getElementById('_authTabLogin').classList.remove('active');
            document.getElementById('_authSubmit').textContent = 'Create account';
            document.getElementById('_authMsg').classList.remove('show', 'error', 'success');
            document.getElementById('_nameField').style.display = 'block';
        });

        return new Promise((resolve) => {
            async function attempt() {
                const email = document.getElementById('_authEmail').value.trim();
                const password = document.getElementById('_authPassword').value;
                const btn = document.getElementById('_authSubmit');
                const msgEl = document.getElementById('_authMsg');

                if (!email || !password) {
                    msgEl.textContent = 'Please fill in both fields.';
                    msgEl.className = 'mochi-auth-msg show error';
                    return;
                }

                btn.disabled = true;
                btn.textContent = mode === 'login' ? 'Logging in...' : 'Creating account...';
                msgEl.classList.remove('show');

                try {
                    if (mode === 'login') {
                        const { data, error } = await _sb.auth.signInWithPassword({ email, password });
                        if (error) throw error;
                        _user = data.user;
                        overlay.remove();
                        resolve(_user);
                    } else {
                        const nickname = document.getElementById('_authName').value.trim();
                        const { data, error } = await _sb.auth.signUp({
                            email, password,
                            options: { data: { nickname } }
                        });
                        if (error) throw error;

                        if (!data.session) {
                            msgEl.textContent = '✓ Check your email to confirm your account, then log in here!';
                            msgEl.className = 'mochi-auth-msg show success';
                            document.getElementById('_authTabLogin').click();
                            btn.disabled = false;
                            return;
                        }
                        _user = data.user;
                        overlay.remove();
                        resolve(_user);
                    }
                } catch (err) {
                    msgEl.textContent = err.message || 'Something went wrong. Try again!';
                    msgEl.className = 'mochi-auth-msg show error';
                    btn.disabled = false;
                    btn.textContent = mode === 'login' ? 'Log in' : 'Create account';
                }
            }

            document.getElementById('_authSubmit').addEventListener('click', attempt);
            document.getElementById('_authPassword').addEventListener('keydown', e => {
                if (e.key === 'Enter') attempt();
            });
            document.getElementById('_authEmail').addEventListener('keydown', e => {
                if (e.key === 'Enter') document.getElementById('_authPassword').focus();
            });
        });
    }

    // ── Account link in nav (skips if already there) ─
    function _injectSignOut() {
        const nav = document.querySelector('nav');
        if (!nav) return;
        if (!nav.querySelector('a[href="account.html"]')) {
            const link = document.createElement('a');
            link.href = 'account.html';
            link.textContent = 'Account';
            nav.appendChild(link);
        }
        // On phones the nav scrolls sideways — make sure the current page's link is visible
        const active = nav.querySelector('a.active');
        if (active && nav.scrollWidth > nav.clientWidth) {
            nav.scrollLeft = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
        }
    }

    // ── Notifications ──────────────────────────────
    const _VAPID_PUBLIC_KEY = 'BGQOH5JoGLOfqsBle0HhYYZAOfzfu4vFoOEN1OgYedb48wJgogUO_SrU7yZabr_Bz45KGgrvZrNnbhWz_4ciwtE';

    function _urlB64ToUint8(base64) {
        const padding = '='.repeat((4 - base64.length % 4) % 4);
        const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(b64);
        return Uint8Array.from(raw, c => c.charCodeAt(0));
    }

    window.mochiGetNotificationStatus = async () => {
        if (!('Notification' in window) || !('PushManager' in window)) return 'unsupported';
        if (Notification.permission === 'denied') return 'denied';
        if (Notification.permission !== 'granted') return 'off';
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        return sub ? 'on' : 'off';
    };

    window.mochiEnableNotifications = async () => {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: _urlB64ToUint8(_VAPID_PUBLIC_KEY)
        });
        const { error } = await _sb.from('push_subscriptions').upsert({
            user_id: _user.id,
            subscription: sub.toJSON()
        }, { onConflict: 'user_id' });
        if (error) throw error;
        return true;
    };

    window.mochiDisableNotifications = async () => {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await _sb.from('push_subscriptions').delete().eq('user_id', _user.id);
    };

    // ── Main entry point ────────────────────────────
    window.initMochi = async function (onReady) {
        _injectStyles();

        try {
            const cached = localStorage.getItem('mochi-companion');
            if (cached) _applyCompanionTheme(cached);
        } catch (_) {}

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/Mochi/sw.js', { scope: '/Mochi/' }).catch(() => {});
        }

        const { data: { session } } = await _sb.auth.getSession();
        if (session) {
            _user = session.user;
        } else {
            // Try refreshing — handles the case where the JWT expired but refresh token is still valid
            const { data: refreshed } = await _sb.auth.refreshSession();
            if (refreshed?.session) {
                _user = refreshed.session.user;
            } else {
                _user = await _showAuthModal();
            }
        }

        _injectSignOut();

        const realTheme = window.mochiGetRoomTheme();
        _applyCompanionTheme(realTheme);
        try { localStorage.setItem('mochi-companion', realTheme); } catch (_) {}

        try {
            await window.mochiLoadBooks();
        } catch (e) {
            console.error('Mochi: failed to load books', e);
        }

        onReady();
    };

})();
