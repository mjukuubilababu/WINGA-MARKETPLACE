'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let client, current, busy = false, identity;
  const previews = new Map();
  const notice = value => { $('notice').textContent = value || ''; };
  const explain = failure => {
    const code = failure.code || failure.message;
    return ({
      device_not_authorized: 'Kifaa cha browser hii hakijaidhinishwa. Ikiwa kinaonyesha pending, ingia kwenye kifaa active cha akaunti hiyo hiyo, chagua kifaa hiki na My Fingerprint yake, kisha bonyeza Approve.',
      fingerprint_mismatch: 'Fingerprint haifanani na kifaa ulichochagua. Nakili My Fingerprint nzima ya kifaa hicho (herufi 64), kisha bandika kwenye Expected Fingerprint. ID fupi ya kifaa si fingerprint.',
      device_fingerprint_mismatch: 'Approve au Revoke inahitaji kifaa cha akaunti yako na My Fingerprint sahihi ya kifaa hicho. Hakiki akaunti, Device na fingerprint nzima ya herufi 64.',
      verified_device_required: 'Chagua kifaa active na uthibitishe My Fingerprint yake kupitia Verify kabla ya Join Conversation.',
      conversation_required: 'Chagua conversation kwenye orodha kwanza, au bonyeza Create kuunda mpya.',
      recipient_not_joined: 'Kifaa cha recipient bado hakijaongezwa. Ingia kwenye browser tofauti, thibitisha fingerprints kupitia Verify, kisha chagua kifaa na bonyeza Join Conversation.'
    })[code] || code || 'Request Failed';
  };
  async function run(work, clearNotice = true) {
    if (busy) return; busy = true;
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { if (clearNotice) notice(''); await work(); }
    catch (failure) { if (failure.code === 'backup_revision_conflict') $('discard-pending').hidden = false; notice(explain(failure)); }
    finally { busy = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function connected(value) {
    identity = value; $('login').hidden = true; $('workspace').hidden = false; $('workspace').dataset.view = 'rooms'; $('logout').hidden = false;
    $('account').textContent = `${value.owner} / ${value.status} / ${value.deviceId.slice(0, 8)}`; $('fingerprint').value = value.fingerprint;
    await refreshDirectory(); if (value.status === 'active') await refresh();
  }
  async function refreshDirectory() {
    const previous = $('device-list').value, rows = await client.directory(); $('device-list').replaceChildren();
    const self = rows.find(row => row.id === identity.deviceId); if (self) { identity.status = self.status; $('account').textContent = `${identity.owner} / ${self.status} / ${identity.deviceId.slice(0, 8)}`; }
    for (const row of rows.filter(row => row.id !== identity.deviceId)) {
      const option = document.createElement('option'); option.value = row.id; option.textContent = `${row.owner} / ${row.status} / ${row.trusted ? 'verified' : 'unverified'} / ${row.id.slice(0, 8)}`; $('device-list').append(option);
    }
    if (rows.some(row => row.id === previous)) $('device-list').value = previous;
  }
  async function renderMessages() {
    $('messages').replaceChildren(); if (!current) return;
    const history = await client.history(current), visible = new Set(history.map(item => item.id));
    for (const [id, preview] of previews) if (!visible.has(id)) { URL.revokeObjectURL(preview.url); previews.delete(id); }
    for (const item of history) {
      const row = document.createElement('article'); row.className = `message${item.owner === identity.owner ? ' own' : ''}`; row.dataset.messageId = item.id;
      const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = item.text; row.append(bubble);
      if (item.attachment) {
        const preview = previews.get(item.id);
        if (preview) { const image = document.createElement('img'); image.src = preview.url; image.alt = preview.name; bubble.append(image); }
        else {
        const button = document.createElement('button'); button.textContent = 'Open Attachment';
        button.addEventListener('click', () => run(async () => {
          const opened = await client.openAttachment(item.id);
          if (['image/png','image/jpeg','image/webp','image/gif'].includes(opened.blob.type)) {
            const url = URL.createObjectURL(opened.blob); previews.set(item.id, { url, name: opened.name }); const image = document.createElement('img'); image.src = url; image.alt = opened.name; bubble.append(image); button.remove();
          } else download(opened.blob, opened.name);
        })); bubble.append(button);
        }
      }
      const status = document.createElement('small'); status.textContent = `${item.owner} / ${item.status}${item.recovered ? ' / recovered' : ''}`; row.append(status); $('messages').append(row);
    }
    $('messages').scrollTop = $('messages').scrollHeight;
    await markVisibleRead();
  }
  async function markVisibleRead() {
    if (!client || !current || document.visibilityState !== 'visible' || !document.hasFocus()
      || (innerWidth <= 600 && $('workspace').dataset.view !== 'chat')) return;
    const box = $('messages').getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const ids = [...$('messages').querySelectorAll('[data-message-id]')].filter(row => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > Math.max(0, box.top) && rect.top < Math.min(innerHeight, box.bottom)
        && rect.right > Math.max(0, box.left) && rect.left < Math.min(innerWidth, box.right);
    }).map(row => row.dataset.messageId);
    await client.markRead(current, ids);
  }
  $('messages').addEventListener('scroll', () => { if (!busy) run(markVisibleRead, false); }, { passive: true });
  async function refresh() {
    await client.sync(); const rooms = await client.rooms(); $('room-list').replaceChildren();
    for (const room of rooms) {
      const quarantined = (await client.vault.get(`group:${room.id}`))?.quarantined;
      const button = document.createElement('button'); button.className = `room-button${current === room.id ? ' active' : ''}`;
      button.disabled = busy;
      button.textContent = `${room.participants.filter(owner => owner !== identity.owner).join(', ')} / epoch ${room.epoch}${quarantined ? ' / quarantined' : room.blocked ? ' / rekey required' : ''}`;
      button.addEventListener('click', () => run(async () => { current = room.id; $('room-title').textContent = room.participants.join(' & '); $('workspace').dataset.view = 'chat'; await refresh(); })); $('room-list').append(button);
    }
    await renderMessages();
  }
  $('login').addEventListener('submit', event => { event.preventDefault(); run(async () => { client = WingaAudit.createClient(); const value = await client.login($('owner').value, $('password').value); $('password').value = ''; await connected(value); }); });
  $('logout').addEventListener('click', () => run(async () => { await client.logout(); client = null; location.reload(); }));
  $('create').addEventListener('submit', event => { event.preventDefault(); run(async () => { current = await client.createRoom($('peer').value); await refresh(); }); });
  $('sync').addEventListener('click', () => run(refresh));
  $('compose').addEventListener('submit', event => { event.preventDefault(); run(async () => {
    if (!current) throw new Error('conversation_required'); const file = $('file').files[0];
    let sent;
    if (file) sent = await client.sendMedia(current, file, { name: file.name, mime: file.type || 'application/octet-stream' }, $('text').value);
    else sent = await client.sendText(current, $('text').value);
    if (sent.status === 'failed') throw new Error('recipient_not_joined');
    $('text').value = ''; $('file').value = ''; await refresh();
  }); });
  const target = () => [$('device-list').value, $('expected').value.trim().toLowerCase()];
  $('trust').onclick = () => run(async () => { await client.trustDevice(...target()); await refreshDirectory(); });
  $('approve').onclick = () => run(async () => { await client.approveDevice(...target()); await refreshDirectory(); });
  $('add').onclick = () => run(async () => { if (!current) throw new Error('conversation_required'); await client.addDevice(current, target()[0]); await refresh(); });
  $('revoke').onclick = () => run(async () => { if (!confirm('Revoke this device?')) return; await client.revokeDevice(...target()); await refreshDirectory(); await refresh(); });
  $('remove').onclick = () => run(async () => { if (!current) throw new Error('conversation_required'); await client.removeDevice(current, target()[0]); await refresh(); });
  $('rejoin').onclick = () => run(async () => { if (!current) throw new Error('conversation_required'); if (confirm('Clear the local group and pending sends?')) await client.prepareRejoin(current); });
  $('generate').onclick = () => run(async () => { const key = await client.generateRecoveryKey(); $('recovery-key').value = key; $('key-saved').checked = false; download(new Blob([key + '\n'], { type: 'text/plain' }), 'winga-recovery-key.txt'); });
  $('backup').onclick = () => run(async () => { if (!$('key-saved').checked) throw new Error('recovery_key_confirmation_required'); const result = await client.backup($('recovery-key').value.trim()); $('discard-pending').hidden = true; $('recovery-key').value = ''; notice(`Backup revision ${result.revision}`); });
  $('discard-pending').onclick = () => run(async () => {
    if (!confirm('Discard this device\'s pending backup? The remote backup will be kept.')) return;
    const result = await client.discardPendingBackup({ confirmed: true }); $('discard-pending').hidden = true;
    notice(result.alreadyAccepted ? `Backup revision ${result.revision} accepted` : 'Local pending backup discarded');
  });
  $('restore').onclick = () => run(async () => { const result = await client.restore($('recovery-key').value.trim()); $('recovery-key').value = ''; notice(`Restored ${result.restored}`); await renderMessages(); });
  $('delete-backup').onclick = () => run(async () => { if (confirm('Delete the remote backup?')) await client.deleteBackup(); });
  document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => run(async () => { $('workspace').dataset.view = button.dataset.tab; if (button.dataset.tab === 'chat') await renderMessages(); }));
  window.addEventListener('focus', () => { if (client && current && identity.status === 'active') run(refresh, false); });
  window.addEventListener('online', () => { if (client && identity.status === 'active') run(async () => { await client.flush(); await refresh(); }, false); });
  setInterval(() => { if (client && identity) run(async () => { await refreshDirectory(); if (identity.status === 'active') await refresh(); }, false); }, 3000);
  run(async () => { client = WingaAudit.createClient(); try { await connected(await client.resume()); } catch (failure) { if (failure.status !== 401) throw failure; client = null; } });
})();
