(function () {
  "use strict";

  window.NB = window.NB || {};

  var HOLD_DURATION_MS = 2000;
  var progress = 0;
  var isPressing = false;
  var unlocked = false;
  var lastTime = 0;
  var rafId = null;
  var onSuccessCallback = null;

  function buildWavePath(pct, phase) {
    var width = 220;
    var height = 260;
    var clamped = Math.max(0, Math.min(1, pct));
    var waterY = height - clamped * height;
    var amp = clamped > 0.01 && clamped < 0.99 ? 6.5 : 0;

    var d = "M 0 " + waterY.toFixed(1);
    for (var x = 0; x <= width; x += 20) {
      var y = waterY + Math.sin((x / 42) + phase) * amp;
      d += " L " + x + " " + y.toFixed(1);
    }
    d += " L " + width + " " + height + " L 0 " + height + " Z";
    return d;
  }

  function renderLiquid(timestamp) {
    var wavePath = NB.core.$("#fp-liquid-wave");
    var pctText = NB.core.$("#fp-percent-text");
    var statusText = NB.core.$("#fp-status-text");
    var zone = NB.core.$("#fp-touch-zone");

    if (!lastTime) lastTime = timestamp;
    var dt = Math.min(80, timestamp - lastTime);
    lastTime = timestamp;

    if (isPressing && !unlocked) {
      progress = Math.min(1, progress + dt / HOLD_DURATION_MS);
      if (zone) zone.classList.add("is-pressing");
      if (statusText) statusText.textContent = "Memindai kontur sidik jari...";
    } else if (!isPressing && !unlocked && progress > 0) {
      progress = Math.max(0, progress - (dt / (HOLD_DURATION_MS * 0.75)));
      if (zone) zone.classList.remove("is-pressing");
      if (statusText) {
        statusText.textContent = progress > 0
          ? "Tahan terus hingga penuh"
          : "Sentuh dan tahan garis sidik jari";
      }
    }

    var pctInt = Math.round(progress * 100);
    if (pctText) pctText.textContent = pctInt + "%";
    if (wavePath) {
      wavePath.setAttribute("d", buildWavePath(progress, timestamp * 0.006));
    }

    if (progress >= 1 && !unlocked) {
      unlocked = true;
      isPressing = false;
      if (zone) zone.classList.remove("is-pressing");
      if (statusText) statusText.textContent = "Akses diterima";
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch (e) {}
      }
      setTimeout(function () {
        if (typeof onSuccessCallback === "function") {
          onSuccessCallback();
        }
      }, 240);
      return;
    }

    if (progress > 0 || isPressing) {
      rafId = window.requestAnimationFrame(renderLiquid);
    } else {
      rafId = null;
      lastTime = 0;
    }
  }

  function startLoop() {
    if (!rafId) {
      lastTime = 0;
      rafId = window.requestAnimationFrame(renderLiquid);
    }
  }

  function init(onUnlocked) {
    onSuccessCallback = onUnlocked;
    unlocked = false;
    progress = 0;
    isPressing = false;

    var zone = NB.core.$("#fp-touch-zone");
    if (!zone) return;

    function handleDown(e) {
      if (unlocked) return;
      if (e.cancelable) e.preventDefault();
      isPressing = true;
      startLoop();
    }

    function handleUp() {
      if (unlocked) return;
      isPressing = false;
      startLoop();
    }

    zone.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    zone.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") {
        handleDown(e);
      }
    });
    zone.addEventListener("keyup", function (e) {
      if (e.key === " " || e.key === "Enter") {
        handleUp();
      }
    });
  }

  function reset() {
    unlocked = false;
    progress = 0;
    isPressing = false;
    var wavePath = NB.core.$("#fp-liquid-wave");
    var pctText = NB.core.$("#fp-percent-text");
    var statusText = NB.core.$("#fp-status-text");
    if (wavePath) wavePath.setAttribute("d", buildWavePath(0, 0));
    if (pctText) pctText.textContent = "0%";
    if (statusText) statusText.textContent = "Sentuh dan tahan garis sidik jari";
  }

  window.NB.gate = {
    init: init,
    reset: reset
  };
})();
