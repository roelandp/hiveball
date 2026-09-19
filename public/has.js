class HiveAuth {
  constructor() {
    this.ws = null;
    this.uuid = null;
    this.authKey = null;
    this.token = null;
    this.expire = 0;
    this.account = null;
    this.listeners = {};
    this.server = 'wss://hive-auth.arcange.eu';
    this.appData = {
      name: 'theball',
      description: 'The Ball',
      icon: location.origin + '/icon-192.png'
    };
  }

  on(event, cb) { this.listeners[event] = cb; }
  emit(event, data) { if (this.listeners[event]) this.listeners[event](data); }

  connect() {
    if (this.ws) return;
    this.ws = new WebSocket(this.server);
    this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
    this.ws.onclose = () => { this.ws = null; setTimeout(() => this.connect(), 2000); };
    this.loadState();
  }

  loadState() {
    const saved = localStorage.getItem('has-state');
    if (saved) {
      const s = JSON.parse(saved);
      this.token = s.token;
      this.expire = s.expire;
      this.authKey = s.authKey;
      this.account = s.account;
    }
  }

  saveState() {
    localStorage.setItem('has-state', JSON.stringify({
      token: this.token, expire: this.expire, authKey: this.authKey, account: this.account
    }));
  }

  clearState() {
    this.token = null; this.expire = 0; this.authKey = null; this.account = null;
    localStorage.removeItem('has-state');
  }

  handleMessage(msg) {
    console.log('HAS msg', msg);
    if (msg.cmd === 'auth_wait') {
      const payload = btoa(JSON.stringify({ account: this.account, uuid: msg.uuid, key: this.authKey, host: this.server }));
      this.emit('auth_req', `has://auth_req/${payload}`);
    } else if (msg.cmd === 'auth_ack') {
      try {
        const decrypted = CryptoJS.AES.decrypt(msg.data, this.authKey).toString(CryptoJS.enc.Utf8);
        const data = JSON.parse(decrypted);
        this.token = data.token;
        this.expire = data.expire;
        this.saveState();
        this.emit('auth_success', data);
      } catch(e) { this.emit('error', 'Auth ack decrypt failed'); }
    } else if (msg.cmd === 'auth_nack') {
      this.emit('error', 'Login geweigerd.');
    } else if (msg.cmd === 'sign_wait') {
      this.emit('sign_wait', msg.uuid);
    } else if (msg.cmd === 'sign_ack') {
      if (msg.data) {
        try {
          const decrypted = CryptoJS.AES.decrypt(msg.data, this.authKey).toString(CryptoJS.enc.Utf8);
          this.emit('sign_success', JSON.parse(decrypted));
        } catch(e) { this.emit('error', 'Sign ack decrypt failed'); }
      } else {
        this.emit('sign_success', { broadcasted: true });
      }
    } else if (msg.cmd === 'sign_nack') {
      this.emit('error', 'Ondertekening geweigerd.');
    } else if (msg.cmd === 'sign_err') {
      if (msg.error && msg.error.includes('token')) this.clearState();
      this.emit('error', msg.error);
    }
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== 1) {
      this.emit('error', 'Not connected to HiveAuth.');
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  auth(account) {
    this.account = account;
    this.authKey = CryptoJS.lib.WordArray.random(32).toString();
    const data = CryptoJS.AES.encrypt(JSON.stringify({ app: this.appData }), this.authKey).toString();
    this.send({ cmd: 'auth_req', account, data,   });
  }

  sign(ops, broadcast = false) {
    if (!this.token || this.expire < Date.now()) {
      this.emit('error', 'Sessie verlopen, log opnieuw in.');
      this.clearState();
      return;
    }
    const data = CryptoJS.AES.encrypt(JSON.stringify({ key_type: 'posting', ops, broadcast }), this.authKey).toString();
    this.send({ cmd: 'sign_req', account: this.account, token: this.token, data });
  }
}
window.HAS = new HiveAuth();
