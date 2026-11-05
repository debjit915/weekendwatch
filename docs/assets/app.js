/* Weekend Watch Concierge - shared front-end helpers (no build step, no dependencies).
   All user-supplied text is inserted with textContent via h(), never innerHTML. */
(function () {
  const cfg = window.WW_CONFIG || {};
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const API = (cfg.API_BASE || (isLocal ? 'http://localhost:8787' : '')).replace(/\/+$/, '');

  /** Tiny DOM builder: h('div', {class:'x', onclick:fn}, 'text', child, [children]) */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  }

  async function api(path, { method = 'GET', body, headers = {} } = {}) {
    if (!API) throw new Error('The shop server address is not set yet. Open docs/assets/config.js and set API_BASE.');
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Cannot reach the server. Check your internet connection and try again.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const dayLabel = (ymd) => {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  };
  const SLOT = { morning: 'Morning (9 am - 1 pm)', afternoon: 'Afternoon (2 pm - 6 pm)' };
  const when = (iso) =>
    new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  let cfgPromise = null;
  const config = () => (cfgPromise ||= api('/api/config'));

  function toast(msg) {
    document.getElementById('toast')?.remove();
    const t = h('div', { id: 'toast', role: 'status' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
  };

  /** Header + footer shared by every page. */
  function mountChrome(active) {
    const links = [
      ['index.html', 'Watches', 'shop'],
      ['repair.html', 'Repair', 'repair'],
      ['track.html', 'Track order', 'track'],
    ];
    const brandName = h('span', {}, 'Weekend Watch');
    document.body.prepend(
      h('header', { class: 'site-header' },
        h('div', { class: 'container' },
          h('a', { class: 'brand', href: 'index.html' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), brandName),
          h('nav', { class: 'nav', 'aria-label': 'Main' },
            links.map(([href, label, key]) => h('a', { href, ...(key === active ? { 'aria-current': 'page' } : {}) }, label))))));
    const phone = h('span', {});
    document.body.append(
      h('footer', { class: 'site-footer' },
        h('div', { class: 'container' },
          h('div', {}, 'Weekend-only doorstep delivery and watch repair within ', h('b', {}, '10 km'), ' of our shop. '),
          phone,
          h('div', { class: 'small', style: 'margin-top:6px' }, 'Prices for new watches never exceed MRP; the delivery charge is shown separately.'))));
    config().then((c) => {
      brandName.textContent = c.shopName;
      if (c.shopPhone) phone.append('Questions? Call ', h('a', { href: 'tel:' + c.shopPhone }, c.shopPhone), '.');
    }).catch(() => {});
  }

  function weekendBanner(c) {
    const w = c.weekend;
    return h('div', { class: 'weekend-card' },
      h('span', { class: 'meta' }, 'Next delivery weekend'),
      h('strong', {}, `${w.satLabel} & ${w.sunLabel}`),
      h('span', { class: 'meta' }, `Order or approve your quote before ${w.cutoffLabel} to make it. Later requests go out the weekend after.`));
  }

  /**
   * Delivery details block used by the watch request dialog and the repair form.
   * Returns { el, collect() } - collect() validates and returns the payload fields or throws Error.
   */
  function deliveryForm() {
    const saved = (() => { try { return JSON.parse(store.get('ww_customer') || '{}'); } catch { return {}; } })();
    let geo = null;
    const name = h('input', { type: 'text', id: 'f-name', autocomplete: 'name', value: saved.name || '', maxlength: '80', required: true });
    const phone = h('input', { type: 'tel', id: 'f-phone', autocomplete: 'tel', inputmode: 'numeric', value: saved.phone || '', placeholder: '10-digit mobile number', maxlength: '16', required: true });
    const address = h('textarea', { id: 'f-address', autocomplete: 'street-address', maxlength: '300', placeholder: 'House / shop number, street, ward, town', required: true });
    address.value = saved.address || '';
    const landmark = h('input', { type: 'text', id: 'f-landmark', value: saved.landmark || '', maxlength: '120', placeholder: 'e.g. opposite the blue temple' });
    const notes = h('input', { type: 'text', id: 'f-notes', maxlength: '300', placeholder: 'Anything the delivery person should know (optional)' });
    const honey = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    const geoStatus = h('span', { class: 'hint' }, 'Optional, but it makes delivery faster and more exact.');
    const geoBtn = h('button', { type: 'button', class: 'btn secondary small', onclick: () => {
      if (!navigator.geolocation) { geoStatus.textContent = 'Your browser cannot share location. The address is enough.'; return; }
      geoStatus.textContent = 'Getting your location...';
      navigator.geolocation.getCurrentPosition(
        (p) => { geo = { lat: p.coords.latitude, lng: p.coords.longitude }; geoStatus.textContent = `Location saved (accurate to about ${Math.round(p.coords.accuracy)} m).`; },
        () => { geoStatus.textContent = 'Could not get your location. No problem - the address is enough.'; },
        { enableHighAccuracy: true, timeout: 12000 });
    } }, 'Use my current location');

    const radio = (nameAttr, items, def) => h('div', { class: 'choices' },
      items.map(([v, label]) => h('label', {}, h('input', { type: 'radio', name: nameAttr, value: v, ...(v === def ? { checked: true } : {}) }), label)));
    const el = h('div', {},
      h('div', { class: 'hp' }, h('label', {}, 'Leave this empty', honey)),
      h('div', { class: 'field' }, h('label', { for: 'f-name' }, 'Your name'), name),
      h('div', { class: 'field' }, h('label', { for: 'f-phone' }, 'Mobile number'), phone),
      h('div', { class: 'field' }, h('label', { for: 'f-address' }, 'Address for pickup / delivery'), address),
      h('div', { class: 'field' }, h('label', { for: 'f-landmark' }, 'Landmark'), landmark),
      h('div', { class: 'field' }, geoBtn, geoStatus),
      h('fieldset', {}, h('legend', {}, 'Which day suits you?'), radio('pref_day', [['sat', 'Saturday'], ['sun', 'Sunday'], ['any', 'Either']], 'any')),
      h('fieldset', {}, h('legend', {}, 'What time?'), radio('pref_window', [['morning', 'Morning 9-1'], ['afternoon', 'Afternoon 2-6'], ['any', 'Either']], 'any')),
      h('fieldset', {}, h('legend', {}, 'How will you pay at the door?'), radio('payment_method', [['COD', 'Cash'], ['UPI', 'UPI']], 'COD')),
      h('div', { class: 'field' }, h('label', { for: 'f-notes' }, 'Note (optional)'), notes));

    return {
      el,
      collect() {
        const pick = (n) => el.querySelector(`input[name="${n}"]:checked`)?.value;
        const out = {
          name: name.value.trim(), phone: phone.value.trim(), address: address.value.trim(), landmark: landmark.value.trim(),
          notes: notes.value.trim(), website: honey.value,
          pref_day: pick('pref_day'), pref_window: pick('pref_window'), payment_method: pick('payment_method'),
          ...(geo || {}),
        };
        if (out.name.length < 2) throw new Error('Please enter your name.');
        if (!/^(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}$/.test(out.phone.replace(/\s+/g, ' ').trim())) throw new Error('Please enter a valid 10-digit mobile number.');
        if (out.address.length < 8) throw new Error('Please enter your full address.');
        store.set('ww_customer', JSON.stringify({ name: out.name, phone: out.phone, address: out.address, landmark: out.landmark }));
        return out;
      },
    };
  }

  /** What the customer should read about an order right now. */
  function statusInfo(order, legs) {
    const retail = order.type === 'retail';
    const last = legs.length ? legs[legs.length - 1] : null;
    const returning = !retail && legs.some((l) => l.kind === 'return');
    const steps = retail
      ? ['Requested', 'Priced', 'Approved', 'Scheduled', 'On the way', 'Delivered']
      : ['Pickup', 'Inspection', 'Estimate', 'Repair', 'Return', 'Delivered'];
    const R = {
      retail: { requested: 0, quoted: 1, approved: 2, scheduled: 3, out: 4, delivered: 5 },
      repair: { requested: 0, collected: 1, quoted: 2, repairing: 3, ready: 4, delivered: 5 },
    };
    let step = (retail ? R.retail : R.repair)[order.status];
    if (!retail && (order.status === 'scheduled' || order.status === 'out')) step = returning ? 4 : 0;
    const labels = {
      requested: retail ? 'Waiting for our shop to confirm the price' : 'Pickup will be scheduled for the coming weekend',
      quoted: retail ? 'Price ready - please approve or decline' : 'Repair estimate ready - please approve or decline',
      approved: 'Approved - delivery will be scheduled for the coming weekend',
      collected: 'Your watch is with our technician for inspection',
      repairing: 'Your watch is being repaired',
      ready: 'Ready - return delivery will be scheduled for the coming weekend',
      scheduled: !retail && !returning ? 'Pickup scheduled' : 'Delivery scheduled',
      out: !retail && !returning ? 'Pickup person is on the way' : 'Out for delivery',
      delivered: 'Delivered',
      declined: 'You declined - no charge',
      unavailable: 'Sorry, this watch is not available right now',
      cancelled: 'Cancelled',
    };
    const tone = { delivered: 'good', quoted: 'warn', declined: 'bad', unavailable: 'bad', cancelled: 'bad' }[order.status] || 'info';
    return { steps, step: step ?? -1, label: labels[order.status] || order.status, tone, activeLeg: last && ['scheduled', 'out', 'waiting'].includes(last.status) ? last : null };
  }

  function mapsLink(s) {
    if (s.lat != null && s.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([s.address, s.landmark].filter(Boolean).join(', '));
  }
  const waLink = (phone, text) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
  const pageUrl = (file) => new URL(file, location.href).href;

  function busy(btn, on, label) {
    if (on) { btn.dataset.l = btn.textContent; btn.disabled = true; if (label) btn.textContent = label; }
    else { btn.disabled = false; if (btn.dataset.l) btn.textContent = btn.dataset.l; }
  }

  window.WW = { h, api, rupee, dayLabel, when, SLOT, config, toast, store, session, mountChrome, weekendBanner, deliveryForm, statusInfo, mapsLink, waLink, pageUrl, busy, API };
})();
