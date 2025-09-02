// app.js — Browser-only S3 upload (NO Node 'fs' anywhere)
// Uses AWS SDK v3 (browser ESM) and the File object from <input type="file">
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "https://esm.sh/@aws-sdk/client-s3@3.645.0";

// ---- Settings in localStorage (unchanged) ----
const LS_KEY = 'gms_s3_settings';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveSettings(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
let settings = loadSettings();

// ---- UI refs (unchanged) ----
const dlg = document.getElementById('dlgSettings');
const btnSettings = document.getElementById('btnSettings');
const btnRefresh = document.getElementById('btnRefresh');
const formSettings = document.getElementById('formSettings');
const form = document.getElementById('formGrievance');
const submitResult = document.getElementById('submitResult');
const listDiv = document.getElementById('list');

// ---- Settings modal (unchanged UX) ----
btnSettings.onclick = () => {
  formSettings.querySelector('#awsRegion').value = settings.region || '';
  formSettings.querySelector('#s3Bucket').value = settings.bucket || '';
  formSettings.querySelector('#s3Prefix').value = settings.prefix || '';
  formSettings.querySelector('#awsKey').value = settings.key || '';
  formSettings.querySelector('#awsSecret').value = settings.secret || '';
  dlg.showModal();
};

formSettings.addEventListener('submit', (e) => {
  e.preventDefault();
  const region = formSettings.querySelector('#awsRegion').value.trim();
  const bucket = formSettings.querySelector('#s3Bucket').value.trim();
  const prefix = formSettings.querySelector('#s3Prefix').value.trim();
  const key = formSettings.querySelector('#awsKey').value.trim();
  const secret = formSettings.querySelector('#awsSecret').value.trim();

  if (!region || !bucket || !key || !secret) {
    alert('Please fill Region, Bucket, Access Key and Secret.');
    return;
  }
  settings = { region, bucket, prefix, key, secret };
  saveSettings(settings);
  dlg.close();
  alert('Saved!');
});

// ---- S3 client factory ----
function client() {
  if (!settings.region || !settings.bucket || !settings.key || !settings.secret) {
    throw new Error('Missing S3 settings. Click Settings and fill all required fields.');
  }
  return new S3Client({
    region: settings.region,
    credentials: { accessKeyId: settings.key, secretAccessKey: settings.secret }
  });
}

// ---- Helpers ----
function uid(len = 12) {
  const s = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let o = '';
  for (let i = 0; i < len; i++) o += s[Math.floor(Math.random() * s.length)];
  return o;
}
function ts() { return new Date().toISOString(); }
function prefixSafe() {
  const p = (settings.prefix || 'grievances/').replace(/^\/+/, '');
  return p.endsWith('/') ? p : p + '/';
}
function recordKey(id) { return `${prefixSafe()}${id}/record.json`; }
function fileKey(id, name) {
  const safe = String(name || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `${prefixSafe()}${id}/files/${Date.now()}_${safe}`;
}

// ---- Submit handler (uses File object directly) ----
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitResult.textContent = 'Uploading to S3...';
  try {
    const c = client();

    const fd = new FormData(form);
    const data = {
      id: uid(),
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      category: String(fd.get('category') || 'General'),
      description: String(fd.get('description') || '').trim(),
      created_at: ts(),
      files: []
    };

    if (!data.name || !data.email || !data.description) {
      submitResult.textContent = 'Please fill Name, Email, and Description.';
      return;
    }

    const input = form.querySelector('input[name="files"]');
    const files = input?.files || [];
    const maxFiles = Math.min(files.length, 3);

    // 1) Upload up to 3 attachments (pass the File object directly as Body)
    for (let i = 0; i < maxFiles; i++) {
      const f = files[i];
      const k = fileKey(data.id, f.name);
      await c.send(new PutObjectCommand({
        Bucket: settings.bucket,
        Key: k,
        Body: f,
        ContentType: f.type || 'application/octet-stream'
      }));
      data.files.push({ key: k, name: f.name, size: f.size, type: f.type });
    }

    // 2) Upload JSON record
    const body = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    await c.send(new PutObjectCommand({
      Bucket: settings.bucket,
      Key: recordKey(data.id),
      Body: body,
      ContentType: 'application/json'
    }));

    submitResult.innerHTML = `Submitted! ID: <b>${data.id}</b>.<br>Folder: <code>${prefixSafe()}${data.id}/</code>`;
    form.reset();
    await refreshList();
  } catch (err) {
    console.error(err);
    submitResult.textContent = 'Failed: ' + (err?.message || String(err));
  }
});

// ---- List recent submissions (unchanged logic) ----
btnRefresh.onclick = refreshList;

async function refreshList() {
  listDiv.textContent = 'Loading...';
  try {
    const c = client();
    const cmd = new ListObjectsV2Command({
      Bucket: settings.bucket,
      Prefix: prefixSafe(),
      MaxKeys: 1000
    });
    const resp = await c.send(cmd);
    const records = (resp.Contents || []).filter(o => o.Key.endsWith('/record.json'));

    if (!records.length) {
      listDiv.innerHTML = '<p class="muted">No records found yet.</p>';
      return;
    }
    const html = [];
    for (const obj of records.slice(-20).reverse()) {
      const parts = obj.Key.split('/');
      const id = parts.length > 1 ? parts[1] : '(unknown)';
      html.push(`<div class="item"><b>ID:</b> ${id}<br><b>S3 Key:</b> <code>${obj.Key}</code></div>`);
    }
    listDiv.innerHTML = html.join('');
  } catch (e) {
    listDiv.textContent = 'Failed: ' + (e?.message || String(e));
  }
}

// Try to load on start (ignore errors if settings incomplete)
refreshList().catch(() => {});
