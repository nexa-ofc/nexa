(function () {
  "use strict";

  window.NB = window.NB || {};

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function esc(teks) {
    if (teks === null || teks === undefined) return "";
    return String(teks)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  var LS = {
    get: function (k) {
      try {
        var raw = window.localStorage.getItem(k);
        if (raw === null) return null;
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    set: function (k, v) {
      try {
        window.localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
    del: function (k) {
      try {
        window.localStorage.removeItem(k);
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  function AppError(pesan, kode) {
    var err = new Error(pesan || "Terjadi kesalahan yang tidak diketahui.");
    err.name = "AppError";
    err.kode = kode || "UNKNOWN";
    return err;
  }

  function toast(pesan, tipe) {
    var box = $("#nb-toast-container");
    if (!box) return;
    var el = document.createElement("div");
    el.className = "nb-toast";
    el.setAttribute("data-type", tipe || "info");
    el.textContent = String(pesan || "");
    box.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) {
        el.style.opacity = "0";
        el.style.transition = "opacity 0.2s ease";
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 220);
      }
    }, 3400);
  }

  function openDialog(opts) {
    var options = opts || {};
    var backdrop = $("#nb-dialog-backdrop");
    var titleEl = $("#nb-dialog-title");
    var bodyEl = $("#nb-dialog-body");
    var actionsEl = $("#nb-dialog-actions");

    titleEl.textContent = options.title || "Informasi";
    bodyEl.innerHTML = "";
    actionsEl.innerHTML = "";

    if (typeof options.body === "string") {
      bodyEl.innerHTML = options.body;
    } else if (options.body instanceof Node) {
      bodyEl.appendChild(options.body);
    }

    function close() {
      backdrop.hidden = true;
      document.body.classList.remove("dialog-open");
      bodyEl.innerHTML = "";
      actionsEl.innerHTML = "";
    }

    var actions = Array.isArray(options.actions) && options.actions.length
      ? options.actions
      : [{ label: "Tutup", primary: true, onClick: close }];

    actions.forEach(function (act) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nb-btn" + (act.primary ? " nb-btn-primary" : "") + (act.danger ? " nb-btn-danger" : "");
      btn.textContent = act.label || "OK";
      btn.addEventListener("click", function () {
        if (typeof act.onClick === "function") {
          var res = act.onClick({ close: close, bodyEl: bodyEl });
          if (res !== false && !act.keepOpen) {
            close();
          }
        } else {
          close();
        }
      });
      actionsEl.appendChild(btn);
    });

    backdrop.hidden = false;
    document.body.classList.add("dialog-open");

    return {
      close: close,
      bodyEl: bodyEl
    };
  }

  function b64(bytes) {
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var binary = "";
    var chunkSize = 0x8000;
    for (var i = 0; i < arr.length; i += chunkSize) {
      var chunk = arr.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return window.btoa(binary);
  }

  function fromB64(str) {
    var clean = String(str || "").replace(/\s+/g, "");
    var binary = window.atob(clean);
    var len = binary.length;
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function utf8ToB64(str) {
    var enc = new TextEncoder();
    return b64(enc.encode(String(str || "")));
  }

  function b64ToUtf8(str) {
    var dec = new TextDecoder("utf-8");
    return dec.decode(fromB64(str));
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(AppError("Berkas tidak ditemukan.", "NO_FILE"));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        var idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = function () {
        reject(AppError("Gagal membaca berkas dari perangkat.", "FILE_READ_ERR"));
      };
      reader.readAsDataURL(file);
    });
  }

  function resizeImageFile(file, maxPx) {
    var size = Number(maxPx) || 96;
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(AppError("Berkas gambar tidak tersedia.", "NO_IMAGE"));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var sw = img.naturalWidth || img.width;
          var sh = img.naturalHeight || img.height;
          var side = Math.min(sw, sh);
          var sx = Math.floor((sw - side) / 2);
          var sy = Math.floor((sh - side) / 2);

          var canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

          var dataUrl = canvas.toDataURL("image/png");
          URL.revokeObjectURL(url);
          var comma = dataUrl.indexOf(",");
          resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(AppError("Gagal memproses gambar.", "IMAGE_PROC_ERR"));
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(AppError("Berkas bukan gambar yang valid.", "IMAGE_INVALID"));
      };
      img.src = url;
    });
  }

  function roleBadgeSvg(role) {
    if (role === "developer") {
      return '<svg width="17" height="17" viewBox="0 0 24 24" aria-label="Developer" title="Developer">' +
        '<circle cx="12" cy="12" r="10" fill="#84cc16" stroke="#111827" stroke-width="2" />' +
        '<polyline points="7.5 12.5 10.5 15.5 16.5 9" fill="none" stroke="#111827" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />' +
        "</svg>";
    }
    if (role === "owner") {
      return '<svg width="17" height="17" viewBox="0 0 24 24" aria-label="Owner" title="Owner">' +
        '<circle cx="12" cy="12" r="10" fill="#1d4ed8" stroke="#111827" stroke-width="2" />' +
        '<polyline points="7.5 12.5 10.5 15.5 16.5 9" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />' +
        "</svg>";
    }
    return "";
  }

  function checkSecureContext() {
    var proto = window.location.protocol;
    var host = window.location.hostname;
    var isLocal = host === "localhost" || host === "127.0.0.1";
    if (proto !== "https:" && !isLocal) {
      openDialog({
        title: "Koneksi Tidak Aman",
        body: "<p>Fitur kriptografi peramban hanya bekerja melalui alamat <strong>HTTPS</strong>.</p>" +
              "<p>Silakan buka halaman ini melalui alamat resmi <strong>GitHub Pages</strong> Anda agar proses masuk, enkripsi sandi, dan penyiapan keystore berjalan normal.</p>"
      });
      return false;
    }
    return true;
  }

  window.NB.core = {
    $: $,
    $$: $$,
    esc: esc,
    sleep: sleep,
    LS: LS,
    AppError: AppError,
    toast: toast,
    openDialog: openDialog,
    b64: b64,
    fromB64: fromB64,
    utf8ToB64: utf8ToB64,
    b64ToUtf8: b64ToUtf8,
    fileToBase64: fileToBase64,
    resizeImageFile: resizeImageFile,
    roleBadgeSvg: roleBadgeSvg,
    checkSecureContext: checkSecureContext
  };
})();
