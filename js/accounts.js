(function () {
  "use strict";

  window.NB = window.NB || {};

  var ACCOUNTS_PATH = "community/accounts.json";
  var ITERATIONS = 150000;
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  function generateUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.from(bytes).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function randomInviteCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var bytes = new Uint8Array(10);
    window.crypto.getRandomValues(bytes);
    var out = "";
    for (var i = 0; i < 10; i++) {
      out += chars[bytes[i] % chars.length];
    }
    return out;
  }

  async function deriveHash(password, saltBytes, iter) {
    if (!window.crypto || !window.crypto.subtle) {
      throw NB.core.AppError("Fitur kriptografi tidak tersedia. Buka aplikasi lewat alamat HTTPS.", "NO_SUBTLE");
    }
    var enc = new TextEncoder();
    var keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(String(password)),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    var bits = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: iter || ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );
    return NB.core.b64(new Uint8Array(bits));
  }

  function constantTimeEqual(aStr, bStr) {
    var a = String(aStr || "");
    var b = String(bStr || "");
    var maxLen = Math.max(a.length, b.length);
    var diff = a.length ^ b.length;
    for (var i = 0; i < maxLen; i++) {
      var ca = i < a.length ? a.charCodeAt(i) : 0;
      var cb = i < b.length ? b.charCodeAt(i) : 0;
      diff |= ca ^ cb;
    }
    return diff === 0;
  }

  function normalizeStore(raw) {
    var obj = raw && typeof raw === "object" ? raw : {};
    return {
      version: 1,
      accounts: Array.isArray(obj.accounts) ? obj.accounts : [],
      invites: Array.isArray(obj.invites) ? obj.invites : []
    };
  }

  async function readAll(customCreds) {
    var res = await NB.gh.readJson(ACCOUNTS_PATH, customCreds);
    if (!res.exists) {
      return {
        exists: false,
        sha: null,
        data: { version: 1, accounts: [], invites: [] }
      };
    }
    return {
      exists: true,
      sha: res.sha,
      data: normalizeStore(res.data)
    };
  }

  async function mutate(fn, message, customCreds) {
    for (var attempt = 0; attempt < 4; attempt++) {
      var currentState = await readAll(customCreds);
      var cloned = JSON.parse(JSON.stringify(currentState.data));
      var result = await fn(cloned, currentState.exists);
      if (result && result.abort) {
        return result.value;
      }
      var putRes = await NB.gh.putFile(
        ACCOUNTS_PATH,
        {
          text: JSON.stringify(cloned, null, 2),
          sha: currentState.sha || undefined,
          message: message || "Perbarui data akun NexaBuild"
        },
        customCreds
      );
      if (putRes) {
        return result !== undefined ? result : cloned;
      }
      await NB.core.sleep(250 * (attempt + 1));
    }
    throw NB.core.AppError("Gagal menyimpan perubahan akun karena konflik pembaruan.", "ACC_MUTATE_ERR");
  }

  async function register(payload) {
    var displayName = String(payload.displayName || "").trim();
    var username = String(payload.username || "").trim().toLowerCase();
    var password = String(payload.password || "");
    var inviteCode = String(payload.inviteCode || "").trim().toUpperCase();
    var customCreds = payload.creds;

    if (!displayName || displayName.length < 2) {
      throw NB.core.AppError("Nama tampilan minimal 2 karakter.", "VAL_DISPLAY");
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      throw NB.core.AppError("Username harus 3 hingga 24 karakter huruf kecil, angka, atau garis bawah.", "VAL_USER");
    }
    if (password.length < 8) {
      throw NB.core.AppError("Password minimal 8 karakter.", "VAL_PASS");
    }

    await NB.gh.validateRepo(customCreds);

    var saltBytes = new Uint8Array(16);
    window.crypto.getRandomValues(saltBytes);
    var saltB64 = NB.core.b64(saltBytes);
    var passHash = await deriveHash(password, saltBytes, ITERATIONS);
    var nowIso = new Date().toISOString();

    var createdAccount = await mutate(function (store, fileExists) {
      var dup = store.accounts.some(function (acc) {
        return acc.username === username;
      });
      if (dup) {
        throw NB.core.AppError("Username sudah digunakan. Pilih username lain.", "USER_EXISTS");
      }

      var role = "member";
      var expiresAt = null;
      var matchedInvite = null;

      if (!fileExists || store.accounts.length === 0) {
        role = "developer";
      } else if (inviteCode) {
        matchedInvite = store.invites.find(function (inv) {
          return inv.code === inviteCode && !inv.usedBy;
        });
        if (!matchedInvite) {
          throw NB.core.AppError("Kode undangan tidak valid atau sudah digunakan.", "INVITE_INVALID");
        }
        role = matchedInvite.role === "owner" ? "owner" : "member";
        if (typeof matchedInvite.days === "number" && matchedInvite.days > 0) {
          expiresAt = new Date(Date.now() + matchedInvite.days * 86400000).toISOString();
        }
      }

      var newAcc = {
        id: generateUuid(),
        username: username,
        displayName: displayName,
        role: role,
        passHash: passHash,
        salt: saltB64,
        iter: ITERATIONS,
        createdAt: nowIso,
        expiresAt: expiresAt,
        buildsThisWeek: 0,
        weekResetAt: new Date(Date.now() + WEEK_MS).toISOString(),
        avatar: null
      };

      if (matchedInvite) {
        matchedInvite.usedBy = newAcc.id;
      }

      store.accounts.push(newAcc);
      return newAcc;
    }, "Daftar akun " + username, customCreds);

    NB.core.LS.set("nb_gh", customCreds);
    NB.core.LS.set("nb_session", {
      id: createdAccount.id,
      username: createdAccount.username,
      displayName: createdAccount.displayName,
      role: createdAccount.role,
      expiresAt: createdAccount.expiresAt,
      avatar: createdAccount.avatar || null
    });

    return createdAccount;
  }

  async function login(payload) {
    var username = String(payload.username || "").trim().toLowerCase();
    var password = String(payload.password || "");
    var customCreds = payload.creds;

    if (!username || !password) {
      throw NB.core.AppError("Username dan password wajib diisi.", "VAL_LOGIN");
    }

    await NB.gh.validateRepo(customCreds);

    var state = await readAll(customCreds);
    if (!state.exists || state.data.accounts.length === 0) {
      throw NB.core.AppError("Belum ada akun terdaftar di repositori ini. Silakan daftar terlebih dahulu.", "NO_ACCOUNTS");
    }

    var found = state.data.accounts.find(function (acc) {
      return acc.username === username;
    });
    if (!found) {
      throw NB.core.AppError("Username atau password salah.", "BAD_LOGIN");
    }

    var saltBytes = NB.core.fromB64(found.salt);
    var computedHash = await deriveHash(password, saltBytes, found.iter || ITERATIONS);
    if (!constantTimeEqual(computedHash, found.passHash)) {
      throw NB.core.AppError("Username atau password salah.", "BAD_LOGIN");
    }

    if (found.expiresAt) {
      var expMs = Date.parse(found.expiresAt);
      if (!isNaN(expMs) && expMs <= Date.now()) {
        throw NB.core.AppError("Masa aktif akun Anda telah berakhir. Hubungi Developer untuk kode undangan baru.", "ACC_EXPIRED");
      }
    }

    NB.core.LS.set("nb_gh", customCreds);
    NB.core.LS.set("nb_session", {
      id: found.id,
      username: found.username,
      displayName: found.displayName,
      role: found.role,
      expiresAt: found.expiresAt || null,
      avatar: found.avatar || null
    });

    return found;
  }

  function logout() {
    NB.core.LS.del("nb_session");
  }

  function current() {
    var sess = NB.core.LS.get("nb_session");
    if (!sess || !sess.id || !sess.username) return null;
    if (sess.expiresAt) {
      var expMs = Date.parse(sess.expiresAt);
      if (!isNaN(expMs) && expMs <= Date.now()) {
        logout();
        return null;
      }
    }
    return sess;
  }

  function weeklyRemaining(akun) {
    if (!akun) return 0;
    if (akun.role === "developer" || akun.role === "owner") {
      return Infinity;
    }
    var used = Number(akun.buildsThisWeek || 0);
    if (akun.weekResetAt) {
      var resetMs = Date.parse(akun.weekResetAt);
      if (!isNaN(resetMs) && Date.now() >= resetMs) {
        used = 0;
      }
    }
    return Math.max(0, 3 - used);
  }

  async function createInvite(role, days) {
    var sess = current();
    if (!sess || sess.role !== "developer") {
      throw NB.core.AppError("Hanya Developer yang dapat membuat kode undangan.", "FORBIDDEN");
    }
    var cleanRole = role === "owner" ? "owner" : "member";
    var cleanDays = days === null || days === "" || Number(days) <= 0 ? null : Math.floor(Number(days));
    var code = randomInviteCode();

    var inviteObj = {
      code: code,
      role: cleanRole,
      days: cleanDays,
      createdBy: sess.displayName,
      createdAt: new Date().toISOString(),
      usedBy: null
    };

    await mutate(function (store) {
      store.invites.push(inviteObj);
      return inviteObj;
    }, "Buat undangan " + cleanRole);

    return inviteObj;
  }

  window.NB.accounts = {
    readAll: readAll,
    mutate: mutate,
    register: register,
    login: login,
    logout: logout,
    current: current,
    weeklyRemaining: weeklyRemaining,
    createInvite: createInvite
  };
})();
