(function () {
  "use strict";

  window.NB = window.NB || {};

  var MODULE_META = {
    home: { title: "Home Dashboard", subtitle: "Ringkasan informasi dan perangkat harian" },
    build: { title: "Build Application", subtitle: "Rakit proyek web menjadi APK dan AAB" },
    edit: { title: "Edit History", subtitle: "Riwayat build dan bangun ulang aplikasi" },
    chat: { title: "Global Chat", subtitle: "Diskusi komunitas pengembang NexaBuild" }
  };

  var initializedModules = {};
  var activeModule = "home";
  var customBackHandler = null;

  function showScreen(name) {
    var gate = NB.core.$("#screen-gate");
    var auth = NB.core.$("#screen-auth");
    var intro = NB.core.$("#screen-intro");
    var shell = NB.core.$("#app-shell");

    gate.hidden = name !== "gate";
    auth.hidden = name !== "auth";
    intro.hidden = name !== "intro";
    shell.hidden = name !== "shell";
  }

  function initMascot() {
    var mascot = NB.core.$("#auth-mascot");
    var pupilL = NB.core.$("#mascot-pupil-l");
    var pupilR = NB.core.$("#mascot-pupil-r");
    var eyesOpen = NB.core.$("#mascot-eyes-open");
    var eyesClosed = NB.core.$("#mascot-eyes-closed");
    if (!mascot || !pupilL || !pupilR) return;

    function lookAt(clientX, clientY) {
      var rect = mascot.getBoundingClientRect();
      if (!rect.width) return;
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = Math.max(-1, Math.min(1, (clientX - cx) / 140));
      var dy = Math.max(-1, Math.min(1, (clientY - cy) / 140));
      pupilL.setAttribute("cx", (54 + dx * 3.8).toFixed(1));
      pupilL.setAttribute("cy", (60 + dy * 3.4).toFixed(1));
      pupilR.setAttribute("cx", (86 + dx * 3.8).toFixed(1));
      pupilR.setAttribute("cy", (60 + dy * 3.4).toFixed(1));
    }

    document.addEventListener("mousemove", function (e) {
      if (!NB.core.$("#screen-auth").hidden) {
        lookAt(e.clientX, e.clientY);
      }
    });

    document.addEventListener("touchmove", function (e) {
      if (!NB.core.$("#screen-auth").hidden && e.touches && e.touches[0]) {
        lookAt(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    NB.core.$$(".js-pass-input").forEach(function (inp) {
      inp.addEventListener("focus", function () {
        if (eyesOpen) eyesOpen.hidden = true;
        if (eyesClosed) eyesClosed.hidden = false;
      });
      inp.addEventListener("blur", function () {
        if (eyesOpen) eyesOpen.hidden = false;
        if (eyesClosed) eyesClosed.hidden = true;
      });
    });
  }

  function initAuthForms() {
    var tabLogin = NB.core.$("#tab-login");
    var tabReg = NB.core.$("#tab-register");
    var formLogin = NB.core.$("#form-login");
    var formReg = NB.core.$("#form-register");

    var savedCreds = NB.gh.creds();
    if (savedCreds) {
      var repoStr = savedCreds.owner + "/" + savedCreds.repo;
      NB.core.$("#login-repo").value = repoStr;
      NB.core.$("#login-token").value = savedCreds.token;
      NB.core.$("#reg-repo").value = repoStr;
      NB.core.$("#reg-token").value = savedCreds.token;
    }

    function switchTab(mode) {
      var isLogin = mode === "login";
      tabLogin.classList.toggle("is-active", isLogin);
      tabLogin.setAttribute("aria-selected", String(isLogin));
      tabReg.classList.toggle("is-active", !isLogin);
      tabReg.setAttribute("aria-selected", String(!isLogin));
      formLogin.hidden = !isLogin;
      formReg.hidden = isLogin;
    }

    tabLogin.addEventListener("click", function () { switchTab("login"); });
    tabReg.addEventListener("click", function () { switchTab("register"); });

    function parseRepo(str) {
      var parts = String(str || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").split("/").filter(Boolean);
      if (parts.length !== 2) {
        throw NB.core.AppError("Format repositori harus pemilik/nama-repo.", "BAD_REPO");
      }
      return { owner: parts[0], repo: parts[1] };
    }

    formLogin.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = NB.core.$("#btn-submit-login");
      btn.disabled = true;
      btn.textContent = "Memeriksa...";
      try {
        var parsedRepo = parseRepo(NB.core.$("#login-repo").value);
        var token = NB.core.$("#login-token").value.trim();
        await NB.accounts.login({
          username: NB.core.$("#login-username").value,
          password: NB.core.$("#login-password").value,
          creds: { owner: parsedRepo.owner, repo: parsedRepo.repo, token: token }
        });
        playIntroThenDashboard();
      } catch (err) {
        NB.core.openDialog({
          title: "Gagal Masuk",
          body: "<p>" + NB.core.esc(err.message || "Terjadi kesalahan saat masuk.") + "</p>"
        });
      } finally {
        btn.disabled = false;
        btn.textContent = "Masuk Sekarang";
      }
    });

    formReg.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = NB.core.$("#btn-submit-register");
      btn.disabled = true;
      btn.textContent = "Mendaftarkan...";
      try {
        var parsedRepo = parseRepo(NB.core.$("#reg-repo").value);
        var token = NB.core.$("#reg-token").value.trim();
        var acc = await NB.accounts.register({
          displayName: NB.core.$("#reg-display").value,
          username: NB.core.$("#reg-username").value,
          password: NB.core.$("#reg-password").value,
          inviteCode: NB.core.$("#reg-invite").value,
          creds: { owner: parsedRepo.owner, repo: parsedRepo.repo, token: token }
        });
        NB.core.toast("Akun berhasil dibuat sebagai " + acc.role.toUpperCase(), "success");
        playIntroThenDashboard();
      } catch (err) {
        NB.core.openDialog({
          title: "Gagal Mendaftar",
          body: "<p>" + NB.core.esc(err.message || "Terjadi kesalahan saat pendaftaran.") + "</p>"
        });
      } finally {
        btn.disabled = false;
        btn.textContent = "Daftar Akun";
      }
    });
  }

  function playIntroThenDashboard() {
    var video = NB.core.$("#intro-video");
    var skipBtn = NB.core.$("#btn-skip-intro");
    var finished = false;

    function finishIntro() {
      if (finished) return;
      finished = true;
      try {
        if (video) video.pause();
      } catch (e) {}
      enterDashboard();
    }

    if (!video) {
      enterDashboard();
      return;
    }

    showScreen("intro");
    skipBtn.onclick = finishIntro;
    video.onended = finishIntro;
    video.onerror = finishIntro;

    var fallbackTimer = setTimeout(finishIntro, 6500);
    video.onloadeddata = function () {
      clearTimeout(fallbackTimer);
    };

    try {
      video.currentTime = 0;
      var p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(function () {
          finishIntro();
        });
      }
    } catch (e) {
      finishIntro();
    }
  }

  function updateDrawerProfile() {
    var sess = NB.accounts.current();
    if (!sess) return;

    var avatarEl = NB.core.$("#drawer-avatar");
    var nameEl = NB.core.$("#drawer-display-name");
    var badgeEl = NB.core.$("#drawer-role-badge");
    var userEl = NB.core.$("#drawer-username");
    var expEl = NB.core.$("#drawer-expiry");
    var inviteBtn = NB.core.$("#drawer-btn-invite");

    nameEl.textContent = sess.displayName;
    badgeEl.innerHTML = NB.core.roleBadgeSvg(sess.role);
    userEl.textContent = "@" + sess.username + " • " + sess.role.toUpperCase();

    if (sess.avatar) {
      avatarEl.innerHTML = '<img src="data:image/png;base64,' + NB.core.esc(sess.avatar) + '" alt="Avatar" />';
    } else {
      var initials = sess.displayName.slice(0, 2).toUpperCase();
      avatarEl.textContent = initials;
    }

    if (sess.expiresAt) {
      var d = new Date(sess.expiresAt);
      expEl.textContent = "Berlaku hingga " + d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    } else {
      expEl.textContent = "Masa aktif permanen";
    }

    inviteBtn.hidden = sess.role !== "developer";
  }

  function toggleDrawer(open) {
    var drawer = NB.core.$("#nav-drawer");
    var backdrop = NB.core.$("#drawer-backdrop");
    var willOpen = typeof open === "boolean" ? open : !drawer.classList.contains("is-open");
    drawer.classList.toggle("is-open", willOpen);
    drawer.setAttribute("aria-hidden", String(!willOpen));
    backdrop.hidden = !willOpen;
    if (willOpen) {
      updateDrawerProfile();
    }
  }

  function openProfileDialog() {
    var sess = NB.accounts.current();
    var c = NB.gh.creds();
    if (!sess) return;
    var rem = NB.accounts.weeklyRemaining(sess);
    var quotaText = rem === Infinity ? "Tanpa batas" : (rem + " dari 3 build minggu ini");

    NB.core.openDialog({
      title: "Profil Akun",
      body:
        "<div style='display:flex;flex-direction:column;gap:8px;'>" +
        "<p style='margin:0;'><strong>Nama Tampilan:</strong> " + NB.core.esc(sess.displayName) + "</p>" +
        "<p style='margin:0;'><strong>Username:</strong> @" + NB.core.esc(sess.username) + "</p>" +
        "<p style='margin:0;'><strong>Peran:</strong> " + NB.core.esc(sess.role.toUpperCase()) + "</p>" +
        "<p style='margin:0;'><strong>Sisa Kuota Build:</strong> " + NB.core.esc(quotaText) + "</p>" +
        "<p style='margin:0;'><strong>Repositori:</strong> " + NB.core.esc(c ? (c.owner + "/" + c.repo) : "-") + "</p>" +
        "</div>"
    });
  }

  async function openInviteDialog() {
    var wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "12px";

    wrap.innerHTML =
      '<div class="field-group">' +
      '<label class="field-label" for="inv-role">Peran Akun Baru</label>' +
      '<select id="inv-role" class="nb-select">' +
      '<option value="member">Member</option>' +
      '<option value="owner">Owner</option>' +
      '</select>' +
      '</div>' +
      '<div class="field-group">' +
      '<label class="field-label" for="inv-days">Durasi Aktif dalam Hari</label>' +
      '<input id="inv-days" class="nb-input" type="number" min="0" placeholder="Kosongkan atau 0 untuk permanen" />' +
      '</div>' +
      '<button type="button" id="btn-gen-invite" class="nb-btn nb-btn-primary nb-btn-block">Buat Kode Undangan</button>' +
      '<div id="inv-result-box" hidden class="nb-card" style="padding:12px;">' +
      '<p style="margin:0 0 6px;font-size:12.5px;">Kode Undangan Aktif:</p>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '<strong id="inv-code-val" class="mono-code" style="font-size:18px;letter-spacing:0.1em;"></strong>' +
      '<button type="button" id="btn-copy-invite" class="nb-btn nb-btn-blue">Salin Kode</button>' +
      '</div>' +
      '</div>' +
      '<div>' +
      '<strong style="font-size:13px;">Daftar Undangan Belum Terpakai</strong>' +
      '<div id="inv-active-list" style="margin-top:6px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;">Memuat daftar undangan...</div>' +
      '</div>';

    NB.core.openDialog({
      title: "Buat Akun Undangan",
      body: wrap,
      actions: [{ label: "Selesai", primary: true }]
    });

    async function refreshActiveInvites() {
      var listEl = NB.core.$("#inv-active-list", wrap);
      try {
        var state = await NB.accounts.readAll();
        var active = state.data.invites.filter(function (i) { return !i.usedBy; });
        if (active.length === 0) {
          listEl.innerHTML = "<p style='margin:0;opacity:0.75;'>Belum ada kode undangan yang aktif.</p>";
          return;
        }
        listEl.innerHTML = active.map(function (inv) {
          var dur = inv.days ? (inv.days + " hari") : "Permanen";
          return '<div class="nb-card" style="padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span class="mono-code"><strong>' + NB.core.esc(inv.code) + '</strong></span>' +
            '<span>' + NB.core.esc(inv.role.toUpperCase()) + ' • ' + NB.core.esc(dur) + '</span>' +
            '</div>';
        }).join("");
      } catch (err) {
        listEl.innerHTML = "<p style='margin:0;color:#b91c1c;'>" + NB.core.esc(err.message) + "</p>";
      }
    }

    refreshActiveInvites();

    var genBtn = NB.core.$("#btn-gen-invite", wrap);
    genBtn.addEventListener("click", async function () {
      genBtn.disabled = true;
      genBtn.textContent = "Membuat kode...";
      try {
        var role = NB.core.$("#inv-role", wrap).value;
        var daysRaw = NB.core.$("#inv-days", wrap).value;
        var inv = await NB.accounts.createInvite(role, daysRaw);
        var resBox = NB.core.$("#inv-result-box", wrap);
        var codeVal = NB.core.$("#inv-code-val", wrap);
        codeVal.textContent = inv.code;
        resBox.hidden = false;
        NB.core.toast("Kode undangan berhasil dibuat.", "success");
        await refreshActiveInvites();
      } catch (err) {
        NB.core.toast(err.message || "Gagal membuat kode undangan.", "error");
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = "Buat Kode Undangan";
      }
    });

    var copyBtn = NB.core.$("#btn-copy-invite", wrap);
    copyBtn.addEventListener("click", function () {
      var code = NB.core.$("#inv-code-val", wrap).textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () {
          NB.core.toast("Kode undangan disalin ke papan klip.", "success");
        }).catch(function () {
          NB.core.toast("Gagal menyalin otomatis. Salin kode secara manual.", "warn");
        });
      }
    });
  }

  function setHeaderTitle(title, subtitle) {
    var t = NB.core.$("#header-title");
    var s = NB.core.$("#header-subtitle");
    if (t) t.textContent = title || "";
    if (s) s.textContent = subtitle || "";
  }

  function setHeaderBack(visible, handler) {
    var btnDrawer = NB.core.$("#btn-drawer");
    var btnBack = NB.core.$("#btn-header-back");
    customBackHandler = visible && typeof handler === "function" ? handler : null;
    if (btnDrawer) btnDrawer.hidden = !!visible;
    if (btnBack) btnBack.hidden = !visible;
  }

  function goModule(nama) {
    var modName = MODULE_META[nama] ? nama : "home";
    activeModule = modName;
    setHeaderBack(false, null);

    var meta = MODULE_META[modName];
    setHeaderTitle(meta.title, meta.subtitle);

    NB.core.$$(".nav-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-mod") === modName);
    });

    Object.keys(MODULE_META).forEach(function (key) {
      var sec = NB.core.$("#mod-" + key);
      if (sec) sec.hidden = key !== modName;
    });

    var targetSec = NB.core.$("#mod-" + modName);
    var modObj = NB[modName];

    if (modObj && typeof modObj.init === "function") {
      if (!initializedModules[modName]) {
        initializedModules[modName] = true;
        try {
          modObj.init(targetSec);
        } catch (err) {
          targetSec.innerHTML = '<div class="coming-soon-card"><h2 class="section-title">Module Error</h2><p class="section-subtitle">' + NB.core.esc(err.message) + '</p></div>';
        }
      }
      if (typeof modObj.onShow === "function") {
        try {
          modObj.onShow(targetSec);
        } catch (err2) {}
      }
    } else if (targetSec) {
      targetSec.innerHTML =
        '<div class="coming-soon-card">' +
        '<span class="nb-pill">Segera Hadir</span>' +
        '<h2 class="section-title">' + NB.core.esc(meta.title) + '</h2>' +
        '<p class="section-subtitle">Modul ini belum dimuat pada tahap instalasi saat ini.</p>' +
        '</div>';
    }
  }

  function enterDashboard() {
    showScreen("shell");
    updateDrawerProfile();
    goModule("home");
  }

  function initDrawerAndNav() {
    NB.core.$("#btn-drawer").addEventListener("click", function () { toggleDrawer(true); });
    NB.core.$("#btn-close-drawer").addEventListener("click", function () { toggleDrawer(false); });
    NB.core.$("#drawer-backdrop").addEventListener("click", function () { toggleDrawer(false); });

    NB.core.$("#btn-header-back").addEventListener("click", function () {
      if (typeof customBackHandler === "function") {
        customBackHandler();
      }
    });

    NB.core.$("#drawer-btn-profile").addEventListener("click", function () {
      toggleDrawer(false);
      openProfileDialog();
    });

    NB.core.$("#drawer-btn-invite").addEventListener("click", function () {
      toggleDrawer(false);
      openInviteDialog();
    });

    NB.core.$("#drawer-btn-theme").addEventListener("click", function () {
      var next = NB.theme.toggle();
      NB.core.toast("Tema diubah ke " + (next === "glass" ? "Liquid Glass" : "Neobrutalism"), "info");
    });

    NB.core.$("#drawer-btn-logout").addEventListener("click", function () {
      toggleDrawer(false);
      NB.accounts.logout();
      initializedModules = {};
      NB.gate.reset();
      showScreen("gate");
      NB.core.toast("Anda telah keluar dari akun.", "info");
    });

    NB.core.$$(".nav-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mod = btn.getAttribute("data-mod");
        goModule(mod);
      });
    });
  }

  function bootstrap() {
    NB.theme.init();
    NB.core.checkSecureContext();
    initMascot();
    initAuthForms();
    initDrawerAndNav();

    showScreen("gate");
    NB.gate.init(function () {
      var sess = NB.accounts.current();
      var creds = NB.gh.creds();
      if (sess && creds) {
        playIntroThenDashboard();
      } else {
        showScreen("auth");
      }
    });
  }

  window.NB.app = {
    goModule: goModule,
    setHeaderTitle: setHeaderTitle,
    setHeaderBack: setHeaderBack,
    activeModule: function () { return activeModule; },
    updateDrawerProfile: updateDrawerProfile
  };

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
