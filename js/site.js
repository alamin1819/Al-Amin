/*
 * Site behaviour shared by index.html, Personal.html and si.html.
 * Plain JavaScript, no dependencies. Every feature is opt-in through
 * data-* attributes, so a page only runs the parts it has markup for.
 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------------------------------------------------------------
     Navigation: mobile toggle, solid background on scroll,
     active link while scrolling through sections
  ------------------------------------------------------------- */
  function initNav() {
    var nav = document.querySelector("[data-nav]");
    if (!nav) return;

    var toggle = nav.querySelector("[data-nav-toggle]");
    var menu = nav.querySelector("[data-nav-menu]");
    var alwaysSolid = nav.hasAttribute("data-nav-solid");

    function setOpen(open) {
      if (!toggle || !menu) return;
      menu.classList.toggle("hidden", !open);
      menu.classList.toggle("flex", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.querySelector("[data-icon-open]").classList.toggle("hidden", open);
      toggle.querySelector("[data-icon-close]").classList.toggle("hidden", !open);
      updateSolid();
    }

    function isOpen() {
      return toggle && toggle.getAttribute("aria-expanded") === "true";
    }

    function updateSolid() {
      nav.classList.toggle("is-solid", alwaysSolid || window.scrollY > 24 || isOpen());
    }

    if (toggle && menu) {
      toggle.addEventListener("click", function () {
        setOpen(!isOpen());
      });
      menu.addEventListener("click", function (event) {
        if (event.target.closest("a")) setOpen(false);
      });
      document.addEventListener("click", function (event) {
        if (isOpen() && !nav.contains(event.target)) setOpen(false);
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && isOpen()) {
          setOpen(false);
          toggle.focus();
        }
      });
      // Close the mobile menu once the desktop layout takes over
      var breakpoint = nav.getAttribute("data-nav-breakpoint") || "1024";
      window.matchMedia("(min-width: " + breakpoint + "px)").addEventListener("change", function (event) {
        if (event.matches) setOpen(false);
      });
    }

    updateSolid();
    window.addEventListener("scroll", updateSolid, { passive: true });

    // Highlight the link of the section currently in view
    var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    var sections = links
      .map(function (link) {
        return document.querySelector(link.getAttribute("href"));
      })
      .filter(Boolean);
    if (!sections.length || !("IntersectionObserver" in window)) return;

    function setActive(id) {
      links.forEach(function (link) {
        var active = link.getAttribute("href") === "#" + id;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (section) {
      observer.observe(section);
    });

    // Above the first linked section (e.g. back at the hero) nothing is active
    window.addEventListener(
      "scroll",
      function () {
        if (sections[0].getBoundingClientRect().top > window.innerHeight * 0.5) setActive(null);
      },
      { passive: true }
    );
  }

  /* -------------------------------------------------------------
     Typing animation for the hero roles
  ------------------------------------------------------------- */
  function initTyping() {
    var el = document.querySelector("[data-typing]");
    if (!el) return;

    var words = JSON.parse(el.getAttribute("data-typing"));
    var wordIndex = 0;

    if (reduceMotion) {
      // No per-letter animation: swap whole words instead
      setInterval(function () {
        wordIndex = (wordIndex + 1) % words.length;
        el.textContent = words[wordIndex];
      }, 2500);
      return;
    }

    var charIndex = words[0].length;
    var deleting = true;
    el.textContent = words[0];

    function tick() {
      var word = words[wordIndex];
      var delay = deleting ? 60 : 120;

      if (deleting) {
        charIndex -= 1;
        if (charIndex === 0) {
          deleting = false;
          wordIndex = (wordIndex + 1) % words.length;
          delay = 300;
        }
      } else {
        charIndex += 1;
        if (charIndex === word.length) {
          deleting = true;
          delay = 1600;
        }
      }

      el.textContent = words[wordIndex].slice(0, charIndex);
      setTimeout(tick, delay);
    }

    setTimeout(tick, 1600);
  }

  /* -------------------------------------------------------------
     Count-up numbers
  ------------------------------------------------------------- */
  function initCounters() {
    var counters = document.querySelectorAll("[data-count]");
    if (!counters.length) return;

    var format = new Intl.NumberFormat("en-US");

    function run(el) {
      var target = parseInt(el.getAttribute("data-count"), 10);
      if (reduceMotion) {
        el.textContent = format.format(target);
        return;
      }
      var duration = 1800;
      var start = null;
      function step(time) {
        if (start === null) start = time;
        var progress = Math.min((time - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = format.format(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if (!("IntersectionObserver" in window)) {
      counters.forEach(run);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          run(entry.target);
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* -------------------------------------------------------------
     Fade-in on scroll (CSS only hides elements when motion is allowed)
  ------------------------------------------------------------- */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    items.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* -------------------------------------------------------------
     Image lightbox (native <dialog>)
     Markup: <a href="large.webp" data-lightbox="group" data-caption="...">
  ------------------------------------------------------------- */
  function initLightbox() {
    var triggers = Array.prototype.slice.call(document.querySelectorAll("[data-lightbox]"));
    var dialog = document.querySelector("[data-lightbox-dialog]");
    if (!triggers.length || !dialog || typeof dialog.showModal !== "function") return;

    var img = dialog.querySelector("img");
    var caption = dialog.querySelector("figcaption");
    var counter = dialog.querySelector("[data-lightbox-counter]");
    var group = [];
    var index = 0;

    function show(i) {
      index = (i + group.length) % group.length;
      var item = group[index];
      img.src = item.getAttribute("href");
      img.alt = item.querySelector("img") ? item.querySelector("img").alt : "";
      caption.textContent = item.getAttribute("data-caption") || img.alt;
      counter.textContent = index + 1 + " / " + group.length;
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        var name = trigger.getAttribute("data-lightbox");
        group = triggers.filter(function (t) {
          return t.getAttribute("data-lightbox") === name;
        });
        show(group.indexOf(trigger));
        dialog.showModal();
      });
    });

    dialog.querySelector("[data-lightbox-prev]").addEventListener("click", function () {
      show(index - 1);
    });
    dialog.querySelector("[data-lightbox-next]").addEventListener("click", function () {
      show(index + 1);
    });
    dialog.querySelector("[data-lightbox-close]").addEventListener("click", function () {
      dialog.close();
    });
    // Click on the dark backdrop closes the dialog
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") show(index - 1);
      if (event.key === "ArrowRight") show(index + 1);
    });
    // Drop the large image when closed so it stops using memory
    var placeholder = img.getAttribute("src");
    dialog.addEventListener("close", function () {
      img.src = placeholder;
    });
  }

  /* -------------------------------------------------------------
     Photo slider (Personal page)
  ------------------------------------------------------------- */
  function initSlider() {
    var slider = document.querySelector("[data-slider]");
    if (!slider) return;

    var slides = slider.querySelectorAll("[data-slide]");
    var dots = slider.querySelectorAll("[data-slide-to]");
    var interval = parseInt(slider.getAttribute("data-interval"), 10) || 4000;
    var current = 0;
    var timer = null;

    function show(i) {
      current = (i + slides.length) % slides.length;
      slides.forEach(function (slide, n) {
        var active = n === current;
        slide.classList.toggle("opacity-100", active);
        slide.classList.toggle("opacity-0", !active);
        slide.classList.toggle("invisible", !active);
        slide.setAttribute("aria-hidden", String(!active));
      });
      dots.forEach(function (dot, n) {
        var active = n === current;
        var pip = dot.firstElementChild || dot;
        pip.classList.toggle("bg-amber-400", active);
        pip.classList.toggle("w-6", active);
        pip.classList.toggle("bg-white/40", !active);
        pip.classList.toggle("w-2", !active);
        dot.setAttribute("aria-current", String(active));
      });
    }

    var toggle = slider.querySelector("[data-slide-toggle]");
    var userPaused = false; // pause/play button
    var focused = false; // keyboard focus inside the slider

    function start() {
      stop();
      // reduced motion starts paused (see below); pressing Play still works
      if (userPaused || focused) return;
      timer = setInterval(function () {
        show(current + 1);
      }, interval);
    }

    function stop() {
      clearInterval(timer);
    }

    function go(i) {
      show(i);
      start();
    }

    slider.querySelector("[data-slide-prev]").addEventListener("click", function () {
      go(current - 1);
    });
    slider.querySelector("[data-slide-next]").addEventListener("click", function () {
      go(current + 1);
    });
    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        go(parseInt(dot.getAttribute("data-slide-to"), 10));
      });
    });

    slider.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") go(current - 1);
      if (event.key === "ArrowRight") go(current + 1);
    });

    // Pause/play button
    function setPaused(paused) {
      userPaused = paused;
      if (toggle) {
        toggle.setAttribute("aria-pressed", String(paused));
        toggle.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
        toggle.querySelector("[data-icon-pause]").classList.toggle("hidden", paused);
        toggle.querySelector("[data-icon-play]").classList.toggle("hidden", !paused);
      }
      start();
    }
    if (toggle) {
      toggle.addEventListener("click", function () {
        setPaused(!userPaused);
      });
    }

    // Pause only while a keyboard user is inside the slider (mouse clicks keep it playing)
    slider.addEventListener("focusin", function (event) {
      if (!event.target.matches(":focus-visible")) return;
      focused = true;
      stop();
    });
    slider.addEventListener("focusout", function (event) {
      if (slider.contains(event.relatedTarget)) return;
      focused = false;
      start();
    });

    // Swipe (touch) and drag (mouse / pen)
    var startX = null;
    slider.addEventListener("pointerdown", function (event) {
      if (event.target.closest("button")) return;
      startX = event.clientX;
      // Keep receiving the pointer even if it is released outside the slider
      slider.setPointerCapture(event.pointerId);
    });
    slider.addEventListener("pointerup", function (event) {
      if (startX === null) return;
      var distance = event.clientX - startX;
      startX = null;
      if (distance > 50) go(current - 1);
      else if (distance < -50) go(current + 1);
    });
    slider.addEventListener("pointercancel", function () {
      startX = null;
    });

    show(0);
    if (reduceMotion) setPaused(true);
    else start();
  }

  /* -------------------------------------------------------------
     Reading progress bar and back-to-top button (SI article)
  ------------------------------------------------------------- */
  function initReadingTools() {
    var bar = document.querySelector("[data-progress]");
    var topBtn = document.querySelector("[data-to-top]");
    if (!bar && !topBtn) return;

    var ticking = false;
    function update() {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = "scaleX(" + (max > 0 ? window.scrollY / max : 0) + ")";
      if (topBtn) topBtn.classList.toggle("hidden", window.scrollY < 500);
    }

    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    update();

    if (topBtn) {
      topBtn.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      });
    }
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  initNav();
  initTyping();
  initCounters();
  initReveal();
  initLightbox();
  initSlider();
  initReadingTools();
  initYear();
})();
