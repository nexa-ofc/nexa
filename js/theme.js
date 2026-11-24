(function () {
  "use strict";

  window.NB = window.NB || {};

  var currentTheme = "neo";
  var audioUnlockBound = false;

  function syncGlassVideo() {
    var layer = NB.core.$("#glass-bg-layer");
    var video = NB.core.$("#glass-bg-video");
    if (!layer || !video) return;

    if (currentTheme === "glass") {
      layer.style.display = "block";
      video.muted = false;
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {
          video.muted = true;
          video.play().catch(function () {});
          if (!audioUnlockBound) {
            audioUnlockBound = true;
            var enableSound = function () {
              if (currentTheme === "glass" && video) {
                video.muted = false;
                video.play().catch(function () {});
              }
              document.removeEventListener("pointerdown", enableSound);
              audioUnlockBound = false;
            };
            document.addEventListener("pointerdown", enableSound, { once: true });
          }
        });
      }
    } else {
      layer.style.display = "none";
      try {
        video.pause();
      } catch (e) {}
    }
  }

  function updateDrawerButton() {
    var label = NB.core.$("#drawer-theme-label");
    if (!label) return;
    var small = label.parentElement ? label.parentElement.querySelector("small") : null;
    if (currentTheme === "glass") {
      label.textContent = "Tema Liquid Glass";
      if (small) small.textContent = "Ketuk untuk beralih ke Neobrutalism";
    } else {
      label.textContent = "Tema Neobrutalism";
      if (small) small.textContent = "Ketuk untuk beralih ke Liquid Glass";
    }
  }

  function apply(themeName) {
    var valid = themeName === "glass" ? "glass" : "neo";
    currentTheme = valid;
    document.body.setAttribute("data-theme", valid);
    NB.core.LS.set("nb_theme", valid);

    var metaTheme = NB.core.$('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", valid === "glass" ? "#0f172a" : "#b8f2d8");
    }

    updateDrawerButton();
    syncGlassVideo();
    return valid;
  }

  function toggle() {
    return apply(currentTheme === "neo" ? "glass" : "neo");
  }

  function get() {
    return currentTheme;
  }

  function init() {
    var saved = NB.core.LS.get("nb_theme");
    var video = NB.core.$("#glass-bg-video");
    if (video) {
      video.addEventListener("error", function () {
        video.style.display = "none";
      });
    }
    apply(saved === "glass" ? "glass" : "neo");
  }

  window.NB.theme = {
    init: init,
    apply: apply,
    toggle: toggle,
    get: get
  };
})();
