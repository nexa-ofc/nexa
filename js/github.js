(function () {
  "use strict";

  window.NB = window.NB || {};

  var API_BASE = "https://api.github.com";

  function creds() {
    var c = NB.core.LS.get("nb_gh");
    if (!c || !c.owner || !c.repo || !c.token) return null;
    return {
      owner: String(c.owner).trim(),
      repo: String(c.repo).trim(),
      token: String(c.token).trim()
    };
  }

  function encodeRepoPath(path) {
    return String(path || "")
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
  }

  async function api(path, opts) {
    var options = opts || {};
    var c = options.creds || creds();
    if (!c) {
      throw NB.core.AppError("Kredensial repositori GitHub belum diatur.", "NO_CREDS");
    }

    var cleanPath = path.startsWith("http")
      ? path
      : API_BASE + (path.startsWith("/") ? path : "/" + path);

    var headers = {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + c.token,
      "X-GitHub-Api-Version": "2022-11-28"
    };

    if (options.headers) {
      Object.keys(options.headers).forEach(function (k) {
        headers[k] = options.headers[k];
      });
    }

    var fetchOpts = {
      method: options.method || "GET",
      headers: headers,
      cache: "no-store"
    };

    if (options.body !== undefined && options.body !== null) {
      if (typeof options.body === "string") {
        fetchOpts.body = options.body;
      } else {
        headers["Content-Type"] = "application/json";
        fetchOpts.body = JSON.stringify(options.body);
      }
    }

    var resp;
    try {
      resp = await fetch(cleanPath, fetchOpts);
    } catch (netErr) {
      throw NB.core.AppError("Tidak dapat terhubung ke server GitHub. Periksa koneksi internet Anda.", "NETWORK_ERR");
    }

    var data = null;
    var text = "";
    try {
      text = await resp.text();
      data = text ? JSON.parse(text) : null;
    } catch (parseErr) {
      data = text;
    }

    return {
      ok: resp.ok,
      status: resp.status,
      data: data,
      headers: resp.headers
    };
  }

  async function validateRepo(customCreds) {
    var c = customCreds || creds();
    if (!c || !c.owner || !c.repo || !c.token) {
      throw NB.core.AppError("Owner, nama repositori, dan token wajib diisi.", "INVALID_CREDS");
    }
    var res = await api("/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo), {
      creds: c
    });

    if (res.status === 401) {
      throw NB.core.AppError("Token GitHub salah atau sudah kedaluwarsa.", "GH_401");
    }
    if (res.status === 404) {
      throw NB.core.AppError("Repositori tidak ditemukan atau token tidak memiliki akses ke repositori tersebut.", "GH_404");
    }
    if (res.status === 403) {
      throw NB.core.AppError("Akses ditolak oleh GitHub. Pastikan izin token mencukupi atau batas laju belum terlampaui.", "GH_403");
    }
    if (!res.ok) {
      throw NB.core.AppError("Gagal memverifikasi repositori GitHub.", "GH_ERR");
    }
    if (res.data && res.data.permissions && res.data.permissions.push === false) {
      throw NB.core.AppError("Token tidak memiliki izin tulis ke repositori ini. Aktifkan izin Contents Read and write.", "GH_NO_WRITE");
    }
    return res.data;
  }

  async function readJson(path, customCreds) {
    var c = customCreds || creds();
    var encoded = encodeRepoPath(path);
    var res = await api(
      "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/contents/" + encoded,
      { creds: c }
    );

    if (res.status === 404) {
      return { exists: false, data: null, sha: null };
    }
    if (res.status === 401) {
      throw NB.core.AppError("Token GitHub tidak valid.", "GH_401");
    }
    if (res.status === 403) {
      throw NB.core.AppError("Token tidak diizinkan membaca berkas pada repositori ini.", "GH_403");
    }
    if (!res.ok || !res.data) {
      throw NB.core.AppError("Gagal membaca berkas " + path + " dari GitHub.", "GH_READ_ERR");
    }

    var rawText = "";
    if (res.data.content) {
      rawText = NB.core.b64ToUtf8(res.data.content);
    } else if (res.data.download_url) {
      var dl = await fetch(res.data.download_url, { cache: "no-store" });
      rawText = await dl.text();
    }

    var parsed = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      throw NB.core.AppError("Format JSON pada " + path + " rusak.", "JSON_CORRUPT");
    }

    return {
      exists: true,
      data: parsed,
      sha: res.data.sha
    };
  }

  async function getFileSha(path, customCreds) {
    var c = customCreds || creds();
    var encoded = encodeRepoPath(path);
    var res = await api(
      "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/contents/" + encoded,
      { creds: c }
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.data && res.data.sha ? res.data.sha : null;
  }

  async function putFile(path, opts, customCreds) {
    var options = opts || {};
    var c = customCreds || creds();
    var encoded = encodeRepoPath(path);
    var url = "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/contents/" + encoded;

    var contentB64 = options.contentBase64 !== undefined
      ? options.contentBase64
      : NB.core.utf8ToB64(options.text || "");

    var sha = options.sha || null;
    var maxRetries = 4;

    for (var attempt = 0; attempt < maxRetries; attempt++) {
      if (!sha && attempt > 0) {
        sha = await getFileSha(path, c);
      } else if (sha === undefined && attempt === 0) {
        sha = await getFileSha(path, c);
      }

      var payload = {
        message: options.message || ("Perbarui " + path),
        content: contentB64
      };
      if (sha) {
        payload.sha = sha;
      }

      var res = await api(url, {
        method: "PUT",
        body: payload,
        creds: c
      });

      if (res.ok) {
        return res.data;
      }

      if (res.status === 409 || res.status === 422) {
        sha = await getFileSha(path, c);
        await NB.core.sleep(250 * (attempt + 1));
        continue;
      }

      if (res.status === 401) {
        throw NB.core.AppError("Token GitHub salah saat menyimpan berkas.", "GH_401");
      }
      if (res.status === 403) {
        throw NB.core.AppError("Token tidak memiliki izin tulis ke repositori.", "GH_403");
      }
      throw NB.core.AppError("Gagal menulis berkas " + path + " ke GitHub.", "GH_PUT_ERR");
    }

    throw NB.core.AppError("Konflik penulisan berkas " + path + " setelah beberapa percobaan.", "GH_CONFLICT");
  }

  async function deleteFile(path, message, customCreds) {
    var c = customCreds || creds();
    var encoded = encodeRepoPath(path);
    var url = "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/contents/" + encoded;

    for (var attempt = 0; attempt < 3; attempt++) {
      var sha = await getFileSha(path, c);
      if (!sha) return true;

      var res = await api(url, {
        method: "DELETE",
        body: {
          message: message || ("Hapus " + path),
          sha: sha
        },
        creds: c
      });

      if (res.ok || res.status === 404) return true;
      if (res.status === 409 || res.status === 422) {
        await NB.core.sleep(250);
        continue;
      }
      throw NB.core.AppError("Gagal menghapus berkas " + path + ".", "GH_DEL_ERR");
    }
    return false;
  }

  async function dispatch(workflowFile, inputs) {
    var c = creds();
    var repoInfo = await api("/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo));
    var ref = (repoInfo.ok && repoInfo.data && repoInfo.data.default_branch) ? repoInfo.data.default_branch : "main";

    var url = "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) +
              "/actions/workflows/" + encodeURIComponent(workflowFile) + "/dispatches";

    var res = await api(url, {
      method: "POST",
      body: {
        ref: ref,
        inputs: inputs || {}
      }
    });

    if (res.status === 404) {
      throw NB.core.AppError("Workflow " + workflowFile + " tidak ditemukan di repositori.", "WF_404");
    }
    if (res.status === 403) {
      throw NB.core.AppError("Token tidak memiliki izin Actions Read and write.", "WF_403");
    }
    if (!res.ok) {
      throw NB.core.AppError("Gagal menjalankan workflow " + workflowFile + ".", "WF_DISPATCH_ERR");
    }
    return true;
  }

  async function findRun(workflowFile, sinceMs, displayTitle, opts) {
    var options = opts || {};
    var timeoutMs = options.timeoutMs || 60000;
    var c = creds();
    var start = Date.now();
    var url = "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) +
              "/actions/workflows/" + encodeURIComponent(workflowFile) + "/runs?per_page=15";

    while (Date.now() - start < timeoutMs) {
      var res = await api(url);
      if (res.ok && res.data && Array.isArray(res.data.workflow_runs)) {
        var runs = res.data.workflow_runs;
        for (var i = 0; i < runs.length; i++) {
          var r = runs[i];
          var created = Date.parse(r.created_at || "");
          var titleMatch = displayTitle ? (r.display_title === displayTitle || r.name === displayTitle) : true;
          if (titleMatch && (!sinceMs || created >= sinceMs - 15000)) {
            return r;
          }
        }
      }
      await NB.core.sleep(2500);
    }

    throw NB.core.AppError("Antrean GitHub Actions belum muncul dalam batas waktu tunggu.", "RUN_TIMEOUT");
  }

  async function getRun(id) {
    var c = creds();
    var res = await api("/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/actions/runs/" + encodeURIComponent(id));
    if (!res.ok) {
      throw NB.core.AppError("Gagal mengambil status proses build.", "RUN_ERR");
    }
    return res.data;
  }

  async function getRunJobs(id) {
    var c = creds();
    var res = await api("/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/actions/runs/" + encodeURIComponent(id) + "/jobs");
    if (!res.ok) {
      throw NB.core.AppError("Gagal mengambil detail langkah build.", "JOBS_ERR");
    }
    return res.data && Array.isArray(res.data.jobs) ? res.data.jobs : [];
  }

  async function getReleaseByTag(tag) {
    var c = creds();
    var res = await api("/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/releases/tags/" + encodeURIComponent(tag));
    if (res.status === 404) return null;
    if (!res.ok) {
      throw NB.core.AppError("Gagal memeriksa rilis APK dan AAB.", "REL_ERR");
    }
    return res.data;
  }

  async function secretsPublicKey() {
    var c = creds();
    var res = await api("/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/actions/secrets/public-key");
    if (res.status === 403) {
      throw NB.core.AppError("Token tidak memiliki izin Secrets Read and write.", "SEC_403");
    }
    if (!res.ok || !res.data) {
      throw NB.core.AppError("Gagal mengambil kunci publik Secrets repositori.", "SEC_PUB_ERR");
    }
    return res.data;
  }

  async function listSecretNames() {
    var c = creds();
    var res = await api("/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/actions/secrets?per_page=100");
    if (res.status === 403) {
      throw NB.core.AppError("Token tidak memiliki izin membaca daftar Secrets.", "SEC_403");
    }
    if (!res.ok || !res.data || !Array.isArray(res.data.secrets)) {
      throw NB.core.AppError("Gagal memeriksa daftar GitHub Secrets.", "SEC_LIST_ERR");
    }
    return res.data.secrets.map(function (s) {
      return s.name;
    });
  }

  async function putSecret(nama, encryptedB64, keyId) {
    var c = creds();
    var res = await api(
      "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/actions/secrets/" + encodeURIComponent(nama),
      {
        method: "PUT",
        body: {
          encrypted_value: encryptedB64,
          key_id: keyId
        }
      }
    );
    if (res.status === 403) {
      throw NB.core.AppError("Token ditolak saat menyimpan secret " + nama + ".", "SEC_403");
    }
    if (!res.ok) {
      throw NB.core.AppError("Gagal menyimpan secret " + nama + " ke GitHub.", "SEC_PUT_ERR");
    }
    return true;
  }

  window.NB.gh = {
    creds: creds,
    api: api,
    validateRepo: validateRepo,
    readJson: readJson,
    putFile: putFile,
    deleteFile: deleteFile,
    dispatch: dispatch,
    findRun: findRun,
    getRun: getRun,
    getRunJobs: getRunJobs,
    getReleaseByTag: getReleaseByTag,
    secretsPublicKey: secretsPublicKey,
    listSecretNames: listSecretNames,
    putSecret: putSecret
  };
})();
