/* Koppeling naar Firebase: biedt dezelfde functies als binnen claude.ai (db, downloads, assets), zodat de app los kan draaien. */
(function(){
  window.DLB_STANDALONE = true;
  document.addEventListener('DOMContentLoaded', function(){ document.body.classList.add('standalone'); });
  var cfg = window.FIREBASE_CONFIG || {};
  var ready = (async function(){
    if (!window.firebase || !cfg.projectId || cfg.projectId === 'VUL_IN') throw new Error('Firebase is nog niet ingesteld (firebase-config.js).');
    firebase.initializeApp(cfg);
    await firebase.auth().signInAnonymously();
    return { fs: firebase.firestore(), st: firebase.storage ? firebase.storage() : null };
  })();
  ready.catch(function(e){ console.error(e); setTimeout(function(){ try{ var m=document.getElementById('msg'); if(m){ m.textContent='⚠ Geen verbinding met de opslag: '+(e.message||e); m.classList.add('hint'); } }catch(_){} }, 1500); });
  var clean = function(d){ return JSON.parse(JSON.stringify(d === undefined ? null : d)); };
  var err = function(e){ var c = (e && e.code) || ''; if (/permission-denied/.test(c)) c = 'permission_denied'; return { code: c || 'upstream_error', message: (e && e.message) || String(e) }; };
  function makeDb(fs){
    var snapOf = function(d){ return { id: d.id, exists: d.exists, data: function(){ return d.data(); } }; };
    var docApi = function(path){ var r = fs.doc(path); return {
      get: async function(){ try{ return snapOf(await r.get()); }catch(e){ throw err(e); } },
      set: async function(d){ try{ await r.set(clean(d)); }catch(e){ throw err(e); } },
      update: async function(d){ try{ await r.update(clean(d)); }catch(e){ if (e && e.code === 'not-found') { try{ await r.set(clean(d), { merge: true }); return; }catch(e2){ throw err(e2); } } throw err(e); } },
      delete: async function(){ try{ await r.delete(); }catch(e){ throw err(e); } }
    }; };
    var coll = function(name){ var q = fs.collection(name); var c = {
      orderBy: function(f, dir){ q = q.orderBy(f, dir || 'asc'); return c; },
      limit: function(n){ q = q.limit(n); return c; },
      where: function(f, op, v){ q = q.where(f, op, v); return c; },
      doc: function(id){ return docApi(name + '/' + id); },
      get: async function(){ try{ var s = await q.get(); return { docs: s.docs.map(snapOf) }; }catch(e){ throw err(e); } }
    }; return c; };
    return { doc: docApi, collection: coll };
  }
  // Downloaden met de juiste bestandsnaam (bijv. "Straat 12 - Opname.pdf"). Op telefoons via het deelmenu, zodat de naam ook daar klopt.
  var downloads = { save: async function(o){ var naam = o.filename || 'bestand', f = o.data;
    try{ f = new File([o.data], naam, { type: (o.data && o.data.type) || 'application/octet-stream' }); }catch(_){}
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && navigator.canShare && f instanceof File) { try{ if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: naam }); return true; } }catch(e){ if (e && e.name === 'AbortError') throw { code: 'cancelled', message: 'Geannuleerd' }; } }
    var u = URL.createObjectURL(f); var a = document.createElement('a'); a.href = u; a.download = naam; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 60000); return true; } };
  function makeAssets(st){ if (!st) return null; return {
    upload: async function(blob, o){ var type = (o && o.type) || blob.type || 'application/octet-stream'; var path = 'bestanden/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + String(blob.name || 'bestand').replace(/[^\w.\-]+/g, '_');
      try{ var ref = st.ref(path); await ref.put(blob, { contentType: type }); var url = await ref.getDownloadURL(); return { id: path, url: url, sizeBytes: blob.size, contentType: type }; }catch(e){ throw err(e); } },
    delete: async function(id){ try{ await st.ref(id).delete(); return { deleted: true }; }catch(e){ if (e && e.code === 'storage/object-not-found') return { deleted: false }; throw err(e); } },
    list: async function(){ return { assets: [], usage: {} }; }
  }; }
  // Bestanden via de Cloudflare-Worker (gratis opslag), als cfg.workerUrl is ingevuld; anders Firebase Storage.
  function makeWorkerAssets(base){ var tok = async function(){ await ready; return firebase.auth().currentUser.getIdToken(); };
    var fout = async function(r){ var c = 'upstream_error'; try{ c = (await r.json()).code || c; }catch(_){} throw { code: c, message: 'Bestand: ' + c }; };
    return {
      upload: async function(blob, o){ var type = (o && o.type) || blob.type || 'application/octet-stream';
        var r = await fetch(base + '/upload?name=' + encodeURIComponent(blob.name || 'bestand'), { method: 'PUT', headers: { Authorization: 'Bearer ' + await tok(), 'Content-Type': type }, body: blob });
        if (!r.ok) return fout(r); return r.json(); },
      delete: async function(id){ var r = await fetch(base + '/f/' + encodeURIComponent(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + await tok() } });
        if (!r.ok) return fout(r); return { deleted: true }; },
      list: async function(){ return { assets: [], usage: {} }; }
    }; }
  window.claude = { use: async function(name){
    try{
      if (name === 'downloads') return downloads;
      if (name === 'user') return { isOwner: function(){ return true; } }; // alleen gebruikt om de allereerste beheerder aan te maken
      var r = await ready;
      if (name === 'db') return makeDb(r.fs);
      if (name === 'assets') return cfg.workerUrl ? makeWorkerAssets(cfg.workerUrl) : makeAssets(r.st);
      return null; // sample, mcp, permissions: niet beschikbaar buiten claude.ai
    }catch(e){ return null; }
  } };
})();
