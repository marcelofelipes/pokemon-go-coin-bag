/**
 * Pokémon GO Coin Bag — Interactive Animation & Particle Engine (Canvas + Web Animations API)
 */

const COLORS = {
  cyan: "#00c3e3",
  red: "#ff4554",
  gold: "#ffcb3b",
  goldLight: "#fff3b0",
  goldDark: "#d98218",
  green: "#2ee59d",
};

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let dpr = 1;
let scanningActive = false;

const ambientOrbs = [];
const burstParticles = [];
const goldCoins = [];

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function initParticleCanvas(canvasEl) {
  if (!canvasEl) return;
  canvas = canvasEl;
  ctx = canvas.getContext("2d");

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });

  // Create ambient Poké Portal energy orbs
  const palette = [COLORS.cyan, COLORS.red, COLORS.gold];
  for (let i = 0; i < 28; i++) {
    ambientOrbs.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: randomRange(1.5, 4.2),
      vx: randomRange(-0.28, 0.28),
      vy: randomRange(-0.45, -0.12),
      alpha: randomRange(0.18, 0.55),
      pulse: Math.random() * Math.PI * 2,
      color: palette[i % palette.length],
    });
  }

  requestAnimationFrame(tick);
}

export function setScanningMode(isActive) {
  scanningActive = Boolean(isActive);
}

function getElementCenter(el) {
  if (!el) return { x: width / 2, y: height / 2 };
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Fires a Joy-Con Cyan + Red neon shockwave & spark burst (used when Switch Pairing succeeds)
 */
export function burstJoyConParticles(originEl) {
  const { x, y } = getElementCenter(originEl);
  const count = 48;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + randomRange(-0.1, 0.1);
    const speed = randomRange(3.5, 10.5);
    burstParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: randomRange(2.5, 5.5),
      alpha: 1,
      decay: randomRange(0.015, 0.028),
      color: i % 2 === 0 ? COLORS.cyan : COLORS.red,
    });
  }
}

/**
 * Fires a 3D spinning Gimmighoul Golden Coin fountain + star sparkles (used when Coin Bag unlocks)
 */
export function burstGoldenCoins(originEl) {
  const { x, y } = getElementCenter(originEl);

  // 3D Spinning Gold Coins
  for (let i = 0; i < 36; i++) {
    const angle = randomRange(-Math.PI * 0.88, -Math.PI * 0.12);
    const speed = randomRange(6, 15);
    goldCoins.push({
      x,
      y,
      vx: Math.cos(angle) * speed + randomRange(-2, 2),
      vy: Math.sin(angle) * speed - randomRange(1, 4),
      gravity: 0.34,
      size: randomRange(8, 13.5),
      spin: Math.random() * Math.PI * 2,
      spinSpeed: randomRange(0.14, 0.28),
      tilt: randomRange(-0.4, 0.4),
      alpha: 1,
      decay: randomRange(0.008, 0.015),
    });
  }

  // Accompanying Green + Gold Sparkles
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomRange(2.5, 9.5);
    burstParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: randomRange(2, 4.5),
      alpha: 1,
      decay: randomRange(0.016, 0.03),
      color: i % 3 === 0 ? COLORS.green : COLORS.goldLight,
    });
  }
}

function tick() {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;

  // 1. Render Ambient Poké Portal Orbs (accelerate into vortex when scanningActive)
  for (const orb of ambientOrbs) {
    orb.pulse += 0.03;

    if (scanningActive) {
      const dx = centerX - orb.x;
      const dy = centerY - orb.y;
      const dist = Math.hypot(dx, dy) || 1;
      // Spiral inward toward the Poké Ball
      orb.x += (dx / dist) * 2.4 - (dy / dist) * 1.6;
      orb.y += (dy / dist) * 2.4 + (dx / dist) * 1.6;
      if (dist < 28) {
        const edgeAngle = Math.random() * Math.PI * 2;
        const spawnRadius = Math.max(width, height) * 0.55;
        orb.x = centerX + Math.cos(edgeAngle) * spawnRadius;
        orb.y = centerY + Math.sin(edgeAngle) * spawnRadius;
      }
    } else {
      orb.x += orb.vx;
      orb.y += orb.vy;
      if (orb.y < -10) orb.y = height + 10;
      if (orb.x < -10) orb.x = width + 10;
      if (orb.x > width + 10) orb.x = -10;
    }

    const currentAlpha = orb.alpha * (0.7 + 0.3 * Math.sin(orb.pulse));
    ctx.save();
    ctx.globalAlpha = scanningActive ? Math.min(0.85, currentAlpha * 1.6) : currentAlpha;
    ctx.fillStyle = orb.color;
    ctx.shadowColor = orb.color;
    ctx.shadowBlur = scanningActive ? 14 : 8;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, scanningActive ? orb.r * 1.25 : orb.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. Render Burst Sparkles
  for (let i = burstParticles.length - 1; i >= 0; i--) {
    const p = burstParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.vy += 0.08;
    p.alpha -= p.decay;

    if (p.alpha <= 0) {
      burstParticles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Render 3D Spinning Gimmighoul Gold Coins
  for (let i = goldCoins.length - 1; i >= 0; i--) {
    const c = goldCoins[i];
    c.x += c.vx;
    c.y += c.vy;
    c.vy += c.gravity;
    c.vx *= 0.99;
    c.spin += c.spinSpeed;
    c.alpha -= c.decay;

    if (c.alpha <= 0 || c.y > height + 40) {
      goldCoins.splice(i, 1);
      continue;
    }

    const scaleX = Math.max(0.18, Math.abs(Math.cos(c.spin)));
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.alpha * 1.2);
    ctx.translate(c.x, c.y);
    ctx.rotate(c.tilt);
    ctx.scale(scaleX, 1);

    // Outer Coin Rim
    ctx.beginPath();
    ctx.arc(0, 0, c.size, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.gold;
    ctx.shadowColor = COLORS.gold;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = COLORS.goldLight;
    ctx.stroke();

    // Inner Gimmighoul Coin Slot
    ctx.beginPath();
    ctx.arc(0, 0, c.size * 0.58, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.goldDark;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  requestAnimationFrame(tick);
}

/**
 * Smooth Spring Animation when switching between Steps (1..5)
 */
export function animateStepTransition(viewEl, direction = 1) {
  if (!viewEl || typeof viewEl.animate !== "function") return;
  const offsetX = direction >= 0 ? 28 : -28;
  viewEl.animate(
    [
      { opacity: 0, transform: `translate3d(${offsetX}px, 6px, 0) scale(0.98)` },
      { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
    ],
    {
      duration: 380,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    }
  );
}

/**
 * Iconic Pokémon Capture Wobble + Lock Click animation on the Poké Ball button
 */
export function playPokeballCaptureLock(buttonEl) {
  if (!buttonEl || typeof buttonEl.animate !== "function") return;
  const core = buttonEl.querySelector(".pokeball-core");
  if (!core) return;

  core.animate(
    [
      { transform: "rotate(0deg) scale(1)" },
      { transform: "rotate(-18deg) scale(1.06)", offset: 0.2 },
      { transform: "rotate(18deg) scale(1.06)", offset: 0.45 },
      { transform: "rotate(-10deg) scale(1.08)", offset: 0.7 },
      { transform: "rotate(0deg) scale(1.18)", offset: 0.88 },
      { transform: "rotate(0deg) scale(1)" },
    ],
    {
      duration: 680,
      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    }
  );
}

/**
 * Subtle Pokémon TCG Holographic 3D Card Tilt on Pointer Move
 */
export function initInteractiveTilt(cardEl) {
  if (!cardEl || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  cardEl.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const rect = cardEl.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    const rotX = (-relY * 4.5).toFixed(2);
    const rotY = (relX * 4.5).toFixed(2);

    cardEl.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    cardEl.style.setProperty("--glare-x", `${((relX + 0.5) * 100).toFixed(1)}%`);
    cardEl.style.setProperty("--glare-y", `${((relY + 0.5) * 100).toFixed(1)}%`);
  });

  cardEl.addEventListener("pointerleave", () => {
    cardEl.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  });
}

