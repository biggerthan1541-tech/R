// ── Config ─────────────────────────────────────────────────────────────
// Booking link used by every CTA on the page.
const BOOKING_URL = "https://cal.com/scrollstop-media/free-audit";

// Formspree endpoint for the contact form. Create a free form at
// https://formspree.io and paste its endpoint here (it looks like
// https://formspree.io/f/abcdwxyz). Until then the form refuses to submit
// and tells you why instead of silently losing enquiries.
const FORMSPREE_ENDPOINT = "https://formspree.io/f/YOUR_FORM_ID";

document.querySelectorAll("[data-book]").forEach((el) => {
  el.href = BOOKING_URL;
});

document.getElementById("year").textContent = new Date().getFullYear();

// Sticky nav border once scrolled
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 8);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Mobile menu
const toggle = document.getElementById("nav-toggle");
const links = document.getElementById("nav-links");
const closeMenu = () => {
  links.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open menu");
};
toggle.addEventListener("click", () => {
  const open = links.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});
links.addEventListener("click", (e) => {
  if (e.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

// Video facade — the embed only loads after a click
const facade = document.querySelector(".video__facade");
facade.addEventListener("click", () => {
  if (facade.dataset.embed.includes("VIDEO_ID")) {
    console.warn("Video not configured: set data-embed on .video__facade in index.html");
    return;
  }
  const iframe = document.createElement("iframe");
  iframe.src = facade.dataset.embed;
  iframe.title = "Watch how it works";
  iframe.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  facade.replaceWith(iframe);
});

// Reveal on scroll
const revealer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealer.unobserve(entry.target);
    });
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

// ── Contact form ───────────────────────────────────────────────────────
const form = document.getElementById("audit-form");
const status = document.getElementById("form-status");
const submit = form.querySelector(".form__submit");

form.action = FORMSPREE_ENDPOINT;

const RULES = {
  name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
  email: (v) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "Please enter a valid email address.",
  message: (v) =>
    v.trim().length >= 10 ? "" : "Please tell me a little more — 10 characters or so.",
  consent: (v, field) => (field.checked ? "" : "Please agree before sending."),
};

const showError = (field, message) => {
  const box = document.getElementById("e-" + field.id.slice(2));
  if (message) {
    field.setAttribute("aria-invalid", "true");
    box.textContent = message;
    box.classList.add("is-shown");
  } else {
    field.removeAttribute("aria-invalid");
    box.textContent = "";
    box.classList.remove("is-shown");
  }
  return !message;
};

const validateField = (field) => {
  const rule = RULES[field.name];
  return rule ? showError(field, rule(field.value, field)) : true;
};

const setStatus = (message, kind) => {
  status.innerHTML = message;
  status.className = "form__status is-shown is-" + kind;
};

Object.keys(RULES).forEach((name) => {
  const field = form.elements[name];
  // Only nag about a field once the visitor has already tripped over it.
  field.addEventListener("blur", () => {
    if (field.hasAttribute("aria-invalid")) validateField(field);
  });
  field.addEventListener("input", () => {
    if (field.hasAttribute("aria-invalid")) validateField(field);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fields = Object.keys(RULES).map((name) => form.elements[name]);
  const invalid = fields.filter((field) => !validateField(field));
  if (invalid.length) {
    setStatus("Please fix the highlighted fields and try again.", "error");
    invalid[0].focus();
    return;
  }

  if (FORMSPREE_ENDPOINT.includes("YOUR_FORM_ID")) {
    setStatus(
      "This form isn't connected yet. Add your Formspree endpoint to <code>assets/main.js</code> — meanwhile, email <a href=\"mailto:hello@scrollstopmedia.com\">hello@scrollstopmedia.com</a>.",
      "error"
    );
    return;
  }

  submit.disabled = true;
  const label = submit.textContent;
  submit.textContent = "Sending…";
  status.classList.remove("is-shown");

  try {
    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      form.reset();
      setStatus(
        "<strong>Thanks — that's through.</strong> I'll come back to you within one business day, usually sooner.",
        "success"
      );
      status.focus?.();
    } else {
      const data = await response.json().catch(() => null);
      const detail = data?.errors?.map((err) => err.message).join(" ");
      setStatus(
        detail ||
          'Something went wrong sending that. Please email <a href="mailto:hello@scrollstopmedia.com">hello@scrollstopmedia.com</a> instead.',
        "error"
      );
    }
  } catch {
    setStatus(
      'Couldn\'t reach the server — check your connection, or email <a href="mailto:hello@scrollstopmedia.com">hello@scrollstopmedia.com</a>.',
      "error"
    );
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
});
