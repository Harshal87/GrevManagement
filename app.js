import { S3Client, PutObjectCommand, ListObjectsV2Command } from "https://esm.sh/@aws-sdk/client-s3@3.645.0";

// Simple local settings store
const LS_KEY = 'gms_s3_settings';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveSettings(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

let settings = loadSettings();

// UI elements
const dlg = document.getElementById('dlgSettings');
const btnSettings = document.getElementById('btnSettings');
const btnRefresh = document.getElementById('btnRefresh');
const formSettings = document.getElementById('formSettings');

btnSettings.onclick = () => {
  // populate
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
  settings = { region, bucket, prefix, key, secret };
  saveSettings(settings);
  dlg.close();
  alert('Saved!');
});

function client() {
  if (!settings.region || !settings.bucket || !settings.key || !settings.secret) {
    throw new Error('Missing S3 settings. Click Settings.');
  }
  return new S3Client({
    region: settings.region,
    credentials: { accessKeyId: settings.key, secretAccessKey: settings.secret }
  });
}

// Utilities
function uid(len=12){ const s='abcdefghijklmnopqrstuvwxyz0123456789'; let o=''; for(let i=0;i<len;i++) o+=s[Math.floor(Math.random()*s.length)]; return o; }
function ts(){ return new Date().toISOString(); }
function keyFor(id){ const p = settings.prefix || 'grievances/'; return `${p}${id}/record.json`; }
function fileKeyFor(id, name){ const p = settings.prefix || 'grievances/'; const safe = name.replace(/\s+/g,'_'); return `${p}${id}/files/${Date.now()}_${safe}`; }

// Submit
const form = document.getElementById('formGrievance');
const submitResult = document.getElementById('submitResult');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitResult.textContent = 'Uploading to S3...';
  try {
    const c = client();
    const fd = new FormData(form);
    const data = {
      id: uid(),
      name: fd.get('name'),
      email: fd.get('email'),
      category: fd.get('category') || 'General',
      description: fd.get('description'),
      created_at: ts(),
      files: []
    };

    // Upload files first
    const files = form.querySelector('input[name="files"]').files;
    for (let i=0; i<Math.min(files.length,3); i++) {
      const f = files[i];
      const k = fileKeyFor(data.id, f.name);
      await c.send(new PutObjectCommand({
        Bucket: settings.bucket, Key: k, Body: f, ContentType: f.type || 'application/octet-stream'
      }));
      data.files.push({ key: k, name: f.name });
    }

    // Upload JSON record
    const body = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    await c.send(new PutObjectCommand({ Bucket: settings.bucket, Key: keyFor(data.id), Body: body, ContentType: 'application/json' }));

    submitResult.innerHTML = `Submitted! ID: <b>${data.id}</b>.<br>Folder: <code>${(settings.prefix||'grievances/')+data.id}/</code>`;
    form.reset();
    await refreshList();
  } catch (err) {
    console.error(err);
    submitResult.textContent = 'Failed: ' + err.message;
  }
});

// List recent grievances (by listing S3 prefix and finding */record.json)
const listDiv = document.getElementById('list');
btnRefresh.onclick = refreshList;

async function refreshList() {
  listDiv.textContent = 'Loading...';
  try {
    const c = client();
    const prefix = settings.prefix || 'grievances/';
    const cmd = new ListObjectsV2Command({ Bucket: settings.bucket, Prefix: prefix, MaxKeys: 1000 });
    const resp = await c.send(cmd);
    const records = (resp.Contents || []).filter(o => o.Key.endsWith('/record.json'));

    // Render
    if (!records.length) {
      listDiv.innerHTML = '<p class="muted">No records found yet.</p>';
      return;
    }

    const html = [];
    for (const obj of records.slice(-20).reverse()) { // latest ~20
      const id = obj.Key.split('/')[1];
      html.push(`<div class="item"><b>ID:</b> ${id}<br><b>S3 Key:</b> <code>${obj.Key}</code></div>`);
    }
    listDiv.innerHTML = html.join('');
  } catch (e) {
    listDiv.textContent = 'Failed: ' + e.message;
  }
}

// Try auto load list on start
refreshList().catch(()=>{});
