/**
 * AETHERBUILDER - ADMIN AUTHENTICATION ENGINE
 * Secure client-side password verification with atomic server synchronization.
 */

const AUTH_STORAGE_KEY    = 'aether_admin_master_hash';
const LEGACY_STORAGE_KEY  = 'aether_argon2_master_hash';
const SESSION_STORAGE_KEY = 'aether_admin_session';
const TOKEN_STORAGE_KEY   = 'aether_admin_token';

export const DEFAULT_ADMIN_HASH = '$argon2id$v=19$m=4096,t=3,p=1$AQIDBAUGBwgJCgsMDQ4PEA$AcLtZ2LeyjAEESISSgm0dbsP0qO7+uGaVzDF6ei+1Xw';

export class Argon2Auth {
  constructor() {
    this.hashwasm = window.hashwasm || null;
    this.isReady = false;
    this._enginePromise = null;
    this.initPromise = this.init();
  }

  async ensureEngineReady() {
    if (this.hashwasm && this.hashwasm.argon2id) return true;
    if (window.hashwasm && window.hashwasm.argon2id) {
      this.hashwasm = window.hashwasm;
      this.isReady = true;
      return true;
    }
    if (!this._enginePromise) {
      this._enginePromise = (async () => {
        let attempts = 0;
        while ((!window.hashwasm || !window.hashwasm.argon2id) && attempts < 25) {
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
        this.hashwasm = window.hashwasm || null;
        this.isReady = !!(this.hashwasm && this.hashwasm.argon2id);
        return this.isReady;
      })();
    }
    return await this._enginePromise;
  }

  async init() {
    try {
      await this.ensureEngineReady();
      await this.ensureDefaultAdmin();
    } catch (err) {
      console.warn('Auth init non-blocking warn:', err);
    }
    return this.isReady;
  }

  // Generates cryptographically secure salt
  generateSalt(length = 16) {
    const salt = new Uint8Array(length);
    window.crypto.getRandomValues(salt);
    return salt;
  }

  // Hashes password using memory-hard parameters
  async hashPassword(password) {
    await this.ensureEngineReady();
    if (!this.hashwasm || !this.hashwasm.argon2id) {
      throw new Error('Verification engine is not available.');
    }

    const salt = this.generateSalt(16);
    const hash = await this.hashwasm.argon2id({
      password: password,
      salt: salt,
      parallelism: 1,
      iterations: 3,
      memorySize: 4096, // 4MB RAM cost in browser
      hashLength: 32,
      outputType: 'encoded' // Standard PHC format
    });

    return hash;
  }

  // Verifies password against standard PHC string
  async verifyPassword(password, encodedHash) {
    await this.ensureEngineReady();
    if (!this.hashwasm || !this.hashwasm.argon2Verify) {
      throw new Error('Verification engine is not available.');
    }

    const isValid = await this.hashwasm.argon2Verify({
      password: password,
      hash: encodedHash
    });

    return isValid;
  }

  // Syncs current global master hash from server data/config.json
  async syncServerHash() {
    try {
      const res = await fetch('api.php?action=get_admin_auth&_t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.admin_hash) {
          this.setStoredHash(data.admin_hash);
          return data.admin_hash;
        }
      }
    } catch (err) {
      console.warn('Could not sync admin credentials from server:', err);
    }
    return this.getStoredHash();
  }

  // Ensures there is an initial admin hash in localStorage (default: 'admin123')
  async ensureDefaultAdmin() {
    // 1. First attempt to pull the globally configured hash from the server
    const remoteHash = await this.syncServerHash();
    if (remoteHash) return remoteHash;

    // 2. Check local browser storage
    let currentHash = this.getStoredHash();
    if (!currentHash) {
      currentHash = DEFAULT_ADMIN_HASH;
      try {
        this.setStoredHash(currentHash);
      } catch (err) {
        console.warn('Could not persist default admin credentials:', err);
      }
    }
    return currentHash;
  }

  getStoredHash() {
    return localStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || '';
  }

  setStoredHash(hash) {
    if (hash) {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, hash);
        localStorage.setItem(LEGACY_STORAGE_KEY, hash);
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
      }
    }
  }

  isAuthenticated() {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) === 'authenticated';
  }

  setSession(status) {
    if (status) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, 'authenticated');
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  logout() {
    this.setSession(false);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    window.location.reload();
  }

  async login(password) {
    await this.initPromise;

    // Always sync latest global hash from server before evaluating
    await this.syncServerHash();

    let targetHash = this.getStoredHash();
    if (!targetHash) {
      targetHash = await this.ensureDefaultAdmin();
    }

    const startTime = performance.now();
    const valid = await this.verifyPassword(password, targetHash);
    const computeTime = Math.round(performance.now() - startTime);

    if (valid) {
      this._adminPass = password;
      // Obtain server-side session token
      try {
        const res = await fetch('api.php?action=verify_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ argon2_hash: targetHash, password: password })
        });
        const data = await res.json();
        if (data && data.token) {
          sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        }
      } catch (e) {
        console.warn('verify_session fetch failed, continuing with local session:', e);
      }
      this.setSession(true);
      return { success: true, computeTime };
    } else {
      return { success: false, error: 'Incorrect password. Please try again.', computeTime };
    }
  }

  getAdminPassword() {
    return this._adminPass || '';
  }

  /** Ensures a valid server-side session token is present; fetches one if missing */
  async ensureSessionToken() {
    if (this.isAuthenticated() && !this.getAdminToken()) {
      try {
        const targetHash = this.getStoredHash();
        const res = await fetch('api.php?action=verify_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ argon2_hash: targetHash })
        });
        const data = await res.json();
        if (data && data.token) {
          sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        }
      } catch (err) {
        console.warn('ensureSessionToken background call failed:', err);
      }
    }
  }

  /** Returns the server-signed session token stored in sessionStorage */
  getAdminToken() {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
  }

  /** Checks whether a server session token is present */
  hasValidToken() {
    return !!sessionStorage.getItem(TOKEN_STORAGE_KEY);
  }

  async updatePassword(oldPassword, newPassword) {
    await this.initPromise;

    // Sync latest credentials from server first
    await this.syncServerHash();

    const verifyRes = await this.login(oldPassword);
    if (!verifyRes.success) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    if (!newPassword || newPassword.length < 4) {
      return { success: false, error: 'New password must be at least 4 characters.' };
    }

    const newHash = await this.hashPassword(newPassword);
    this.setStoredHash(newHash);
    this._adminPass = newPassword;

    // Persist new hash globally to server config.json
    try {
      const res = await fetch('api.php?action=save_admin_hash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': this.getAdminToken()
        },
        body: JSON.stringify({
          argon2_hash: newHash,
          admin_hash: newHash
        })
      });
      const data = await res.json();
      if (!res.ok || (data && data.error)) {
        throw new Error(data?.error || 'Server rejected password update');
      }
    } catch (e) {
      console.warn('Could not sync password to server:', e);
      return { success: false, error: 'Password updated locally, but server sync failed: ' + e.message };
    }
    return { success: true, newHash };
  }

  // Renders the clean, simplified admin login modal
  showLoginModal(onSuccess) {
    let existing = document.getElementById('argon2-login-modal');
    if (existing) existing.remove();

    // Ensure any loading overlay is dismissed so login modal is interactive
    const loader = document.getElementById('aether-initial-loader');
    if (loader) loader.remove();

    const modal = document.createElement('div');
    modal.id = 'argon2-login-modal';
    modal.className = 'modal-overlay animate-fade-in';
    modal.innerHTML = `
      <div class="modal-box animate-scale-in" style="max-width: 400px; padding: 0; overflow: hidden; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); background: #0f172a; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);">
        <div style="text-align: center; padding: 26px 20px 14px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.06);">
          <img src="assets/logo.png" alt="AetherBuilder" style="max-height: 72px; width: auto; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(99,102,241,0.25));" />
          <h2 style="margin: 14px 0 4px; font-size: 1.25rem; font-weight: 700; color: #ffffff; letter-spacing: -0.01em;">Admin Login</h2>
          <p style="margin: 0; font-size: 0.85rem; color: #94a3b8;">Enter your password to access the studio.</p>
        </div>

        <form id="admin-login-form" style="padding: 22px 24px 20px; display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label for="admin-pass-input" style="font-size: 0.8rem; font-weight: 600; color: #cbd5e1;">Password</label>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="password" id="admin-pass-input" placeholder="Enter password..." autocomplete="current-password" autofocus required
                style="width: 100%; padding: 11px 40px 11px 14px; font-size: 0.92rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: #1e293b; color: #ffffff; outline: none; transition: border-color 0.2s;" />
              <button type="button" id="toggle-pass-visibility-btn" style="position: absolute; right: 10px; background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; font-size: 1rem; line-height: 1;" title="Toggle password visibility">
                👁️
              </button>
            </div>
          </div>

          <div id="login-error-msg" style="color: #f87171; font-size: 0.84rem; font-weight: 500; min-height: 18px; text-align: left; display: none;"></div>

          <button type="submit" id="login-submit-btn" class="wb-btn wb-btn-primary" style="width: 100%; justify-content: center; padding: 12px; font-size: 0.92rem; font-weight: 600; border-radius: 8px; cursor: pointer;">
            <span id="login-btn-text">Sign In</span>
            <span id="login-spinner" style="display: none; margin-left: 8px;" class="animate-spin">⚙️</span>
          </button>
        </form>

        <div style="padding: 14px 24px 18px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.15);">
          <a href="?view=public" style="font-size: 0.84rem; color: #94a3b8; text-decoration: none; transition: color 0.2s;">← Return to Website</a>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#admin-login-form');
    const passInput = modal.querySelector('#admin-pass-input');
    const errorMsg = modal.querySelector('#login-error-msg');
    const submitBtn = modal.querySelector('#login-submit-btn');
    const submitBtnText = modal.querySelector('#login-btn-text');
    const spinner = modal.querySelector('#login-spinner');
    const togglePassBtn = modal.querySelector('#toggle-pass-visibility-btn');

    togglePassBtn.addEventListener('click', () => {
      if (passInput.type === 'password') {
        passInput.type = 'text';
        togglePassBtn.textContent = '🙈';
      } else {
        passInput.type = 'password';
        togglePassBtn.textContent = '👁️';
      }
    });

    passInput.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      errorMsg.textContent = '';
      submitBtn.disabled = true;
      submitBtnText.textContent = 'Signing in...';
      spinner.style.display = 'inline-block';

      try {
        const res = await this.login(passInput.value);
        if (res.success) {
          modal.classList.add('animate-fade-out');
          setTimeout(() => {
            modal.remove();
            if (typeof onSuccess === 'function') onSuccess();
          }, 200);
        } else {
          errorMsg.textContent = res.error || 'Incorrect password.';
          errorMsg.style.display = 'block';
          const box = modal.querySelector('.modal-box');
          if (box) {
            box.classList.add('animate-shake');
            setTimeout(() => box.classList.remove('animate-shake'), 500);
          }
          passInput.focus();
          passInput.select();
        }
      } catch (err) {
        errorMsg.textContent = `Verification error: ${err.message}`;
        errorMsg.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtnText.textContent = 'Sign In';
        spinner.style.display = 'none';
      }
    });
  }
}

export const auth = new Argon2Auth();
