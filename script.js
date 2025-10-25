const score = document.querySelector(".score");
const startBtn = document.querySelector(".start");
const gameArea = document.querySelector(".gameArea");
const pauseScreen = document.querySelector("#pauseScreen");
const pauseScore = document.querySelector("#pauseScore");
const toggleMusicBtn = document.querySelector("#toggleMusic");
const toggleDayNightBtn = document.querySelector("#toggleDayNight");
const restartBtn = document.querySelector("#restartBtn");
const levelEl = document.querySelector("#level");
const bestScoreEl = document.querySelector("#bestScore");
const livesEl = document.querySelector("#lives");
const nitroFill = document.querySelector("#nitroFill");
const envSelect = document.querySelector("#envSelect");
const bgm = document.querySelector("#bgm");
const crashSfx = document.querySelector("#crashSfx");
const levelSfx = document.querySelector("#levelSfx");
const btnLeft = document.querySelector("#btnLeft");
const btnRight = document.querySelector("#btnRight");
const btnUp = document.querySelector("#btnUp");
const btnDown = document.querySelector("#btnDown");
const btnNitro = document.querySelector("#btnNitro");

let player = {
  speed: 5,
  currentSpeed: 5,
  score: 0,
  isGamePaused: false,
  lives: 3,
  invincibleUntil: 0,
  nitroCharge: 1, // 0..1
  nitroActive: false,
  level: 1,
  dayNightAutoTimer: null,
  environment: localStorage.getItem("environment") || "jungle",
  maxLives: 3,
  nitroReady: false,
};

let gameLoopRunning = false;

const LANES = [25, 175, 325];

let keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowRight: false,
  ArrowLeft: false,
  Space: false,
  KeyP: false,
};

let lines = [];
let enemies = [];
let car;
let musicOn = JSON.parse(localStorage.getItem("musicOn") ?? "true");
if (toggleMusicBtn) {
  toggleMusicBtn.textContent = `Music: ${musicOn ? "On" : "Off"}`;
}
if (bestScoreEl) {
  const hs = parseInt(localStorage.getItem("highScore") || "0", 10);
  bestScoreEl.textContent = `Best: ${hs}`;
}

startBtn.addEventListener("click", () => start(1));
document.addEventListener("keydown", pressOn);
document.addEventListener("keyup", pressOff);
if (toggleMusicBtn) toggleMusicBtn.addEventListener("click", toggleMusic);
if (toggleDayNightBtn) toggleDayNightBtn.addEventListener("click", toggleDayNight);
if (restartBtn) restartBtn.addEventListener("click", () => start(1));
if (envSelect) {
  envSelect.value = player.environment;
  envSelect.addEventListener("change", () => {
    player.environment = envSelect.value;
    localStorage.setItem("environment", player.environment);
    applyEnvironment();
  });
}

function bindBtn(btn, onDown, onUp) {
  if (!btn) return;
  const down = (e) => { e.preventDefault(); onDown(); };
  const up = (e) => { e.preventDefault(); onUp(); };
  btn.addEventListener("touchstart", down, { passive: false });
  btn.addEventListener("touchend", up, { passive: false });
  btn.addEventListener("mousedown", down);
  btn.addEventListener("mouseup", up);
  btn.addEventListener("mouseleave", up);
}

bindBtn(btnLeft, () => { keys.ArrowLeft = true; }, () => { keys.ArrowLeft = false; });
bindBtn(btnRight, () => { keys.ArrowRight = true; }, () => { keys.ArrowRight = false; });
bindBtn(btnUp, () => { keys.ArrowUp = true; }, () => { keys.ArrowUp = false; });
bindBtn(btnDown, () => { keys.ArrowDown = true; }, () => { keys.ArrowDown = false; });
bindBtn(btnNitro, () => {
  if (!player.isGamePaused && player.nitroReady && player.nitroCharge >= 1) {
    player.nitroActive = true;
    if (car) car.classList.add("glow");
    player.nitroReady = false;
  }
}, () => {
  player.nitroActive = false;
  if (car) car.classList.remove("glow");
});

function pressOn(e) {
  e.preventDefault();
  keys[e.key] = true;
  if (e.code === "KeyP") {
    player.isGamePaused = !player.isGamePaused;
    if (player.isGamePaused) {
      pauseScreen.classList.remove("hide");
      pauseScore.textContent = `Score: ${player.score}`;
    } else {
      pauseScreen.classList.add("hide");
      if (player.start) {
        window.requestAnimationFrame(playGame);
      }
    }
  }
  if (e.code === "Space") {
    // Activate nitro only when fully charged and ready
    if (!player.isGamePaused && player.nitroReady && player.nitroCharge >= 1) {
      player.nitroActive = true;
      if (car) car.classList.add("glow");
      player.nitroReady = false;
    }
  }
}

function pressOff(e) {
  e.preventDefault();
  keys[e.key] = false;
  if (e.code === "Space") {
    player.nitroActive = false;
    if (car) car.classList.remove("glow");
  }
}

function moveLines() {
  lines.forEach(function (item) {
    if (item.y >= 1500) {
      item.y -= 1500;
    }
    item.y += player.currentSpeed;
    item.style.top = item.y + "px";
  });
}

function isCollide(a, b) {
  let aRect = a.getBoundingClientRect();
  let bRect = b.getBoundingClientRect();
  return !(
    aRect.bottom < bRect.top ||
    aRect.top > bRect.bottom ||
    aRect.right < bRect.left ||
    aRect.left > bRect.right
  );
}

function moveEnemy() {
  if (!player.start) return;
  enemies.forEach(function (item) {
    if (isCollide(car, item)) {
      const now = performance.now();
      if (now > player.invincibleUntil) {
        // Process a hit
        if (crashSfx && player.start) {
          try { crashSfx.currentTime = 0; crashSfx.play(); } catch {}
        }
        car.classList.add("hit");
        player.invincibleUntil = now + 1500;
        setTimeout(() => car && car.classList.remove("hit"), 1600);
        player.lives -= 1;
        updateLives();
        // push enemy upward to avoid chain collisions
        item.y = -600;
        item.style.top = item.y + "px";
        // Game over if no lives
        if (player.lives <= 0) {
          endGame();
          return;
        }
      }
    }
    if (item.y >= 1500) {
      item.y = -600;
      {
        const lane = pickLane(item.y);
        item.dataset.lane = String(lane);
        item.style.left = `${LANES[lane]}px`;
      }
      item.style.backgroundColor = randomColor();
    }
    item.y += player.currentSpeed;
    item.style.top = item.y + "px";
  });
}

function playGame() {
  if (player.isGamePaused || !player.start) {
    return;
  }
  // compute currentSpeed with nitro
  player.currentSpeed = player.speed + (player.nitroActive ? 5 : 0);
  // nitro drain/recharge
  if (player.nitroActive) {
    player.nitroCharge = Math.max(0, player.nitroCharge - 0.01);
    if (player.nitroCharge === 0) {
      player.nitroActive = false;
      if (car) car.classList.remove("glow");
    }
  } else {
    player.nitroCharge = Math.min(1, player.nitroCharge + 0.002);
    if (player.nitroCharge === 1) {
      player.nitroReady = true;
    }
    // If nitro fully charged, convert to one life (up to maxLives), then reset nitro (no repeated nitro)
    if (player.nitroCharge === 1 && player.lives < player.maxLives) {
      player.lives += 1;
      updateLives();
      player.nitroActive = false;
      player.nitroCharge = 0;
      if (car) car.classList.remove("glow");
      player.nitroReady = false;
    }
  }
  if (nitroFill) nitroFill.style.width = `${Math.round(player.nitroCharge * 100)}%`;
  moveLines();
  moveEnemy();
  // Scroll environment background to simulate movement
  if (gameArea) {
    // tile height set in CSS to 200px
    const tileH = 200;
    const curr = parseFloat(gameArea.dataset.bgY || "0");
    let next = curr + player.currentSpeed * 0.8; // slight parallax factor
    if (next > tileH) next = next - tileH;
    gameArea.dataset.bgY = String(next);
    gameArea.style.backgroundPosition = `0px ${next}px`;
  }
  let road = gameArea.getBoundingClientRect();

  if (player.start) {
    if (keys.ArrowUp && player.y > road.top) {
      player.y -= player.currentSpeed;
    }
    if (keys.ArrowDown && player.y < road.bottom) {
      player.y += player.currentSpeed;
    }
    if (keys.ArrowLeft && player.x > 0) {
      player.x -= player.currentSpeed;
    }
    if (keys.ArrowRight && player.x < road.width - 50) {
      player.x += player.currentSpeed;
    }

    car.style.left = `${player.x}px`;
    car.style.top = `${player.y}px`;

    player.score++;
    score.textContent = `Score: ${player.score}`;

    if (player.score % 1000 === 0) {
      player.speed += 1;
      const newLevel = 1 + Math.floor((player.speed - 5));
      if (newLevel !== player.level) {
        player.level = newLevel;
        if (levelEl) levelEl.textContent = `Level: ${player.level}`;
        if (levelSfx) { try { levelSfx.currentTime = 0; levelSfx.play(); } catch {} }
      }
    }
    if (levelEl) levelEl.textContent = `Level: ${player.level}`;
    if (bestScoreEl) {
      const hs = parseInt(localStorage.getItem("highScore") || "0", 10);
      bestScoreEl.textContent = `Best: ${hs}`;
    }
  }

  if (player.start && !player.isGamePaused) {
    window.requestAnimationFrame(playGame);
  }
}

function endGame() {
  player.start = false;
  const highScore = localStorage.getItem("highScore");
  if (player.score > highScore) {
    localStorage.setItem("highScore", player.score);
    score.innerHTML = `New High Score! Score: ${player.score}`;
  } else {
    score.innerHTML = `Game Over<br>Score was ${player.score}`;
  }
  gameArea.classList.add("fadeOut"); // Add fade out animation
  startBtn.classList.remove("hide");
  if (bgm && !bgm.paused) { try { bgm.pause(); } catch {} }
  // Stop repeating crash sounds and timers
  if (crashSfx) { try { crashSfx.pause(); crashSfx.currentTime = 0; } catch {} }
  if (player.dayNightAutoTimer) { clearInterval(player.dayNightAutoTimer); player.dayNightAutoTimer = null; }
}

function start(level) {
  gameArea.classList.remove("fadeOut"); // Remove fade out animation
  startBtn.classList.add("hide");
  gameArea.innerHTML = "";

  // reset collections
  lines = [];
  enemies = [];

  player.start = true;
  player.speed = 5 + (level - 1) * 2;
  player.currentSpeed = player.speed;
  player.score = 0;
  player.level = level;
  player.lives = 3;
  player.invincibleUntil = 0;
  player.nitroCharge = 1;
  player.nitroActive = false;
  updateLives();
  if (levelEl) levelEl.textContent = `Level: ${player.level}`;
  if (bestScoreEl) {
    const hs = parseInt(localStorage.getItem("highScore") || "0", 10);
    bestScoreEl.textContent = `Best: ${hs}`;
  }

  // Ensure environment class applied and reset background scroll
  applyEnvironment();
  gameArea.dataset.bgY = "0";
  gameArea.style.backgroundPosition = "0px 0px";

  for (let x = 0; x < 10; x++) {
    let div = document.createElement("div");
    div.classList.add("line");
    div.y = x * 150;
    div.style.top = `${div.y}px`;
    gameArea.appendChild(div);
    lines.push(div);
  }

  car = document.createElement("div");
  car.setAttribute("class", "car");
  gameArea.appendChild(car);
  player.x = car.offsetLeft;
  player.y = car.offsetTop;

  const numEnemies = 3 + level;

  for (let x = 0; x < numEnemies; x++) {
    let enemy = document.createElement("div");
    enemy.classList.add("enemy");
    enemy.innerHTML = `<br>${x + 1}`;
    enemy.y = (x + 1) * 600 * -1;
    enemy.style.top = `${enemy.y}px`;
    {
      const lane = pickLane(enemy.y);
      enemy.dataset.lane = String(lane);
      enemy.style.left = `${LANES[lane]}px`;
    }
    enemy.style.backgroundColor = randomColor();
    gameArea.appendChild(enemy);
    enemies.push(enemy);
  }
  // start music if enabled
  if (bgm && musicOn) {
    try { bgm.volume = 0.5; bgm.play(); } catch {}
  }
  // auto day/night cycle
  if (player.dayNightAutoTimer) clearInterval(player.dayNightAutoTimer);
  player.dayNightAutoTimer = setInterval(() => {
    if (player.start && !player.isGamePaused) toggleDayNight();
  }, 30000);
  window.requestAnimationFrame(playGame);
}

function randomColor() {
  let hex = Math.floor(Math.random() * 16777215).toString(16);
  return "#" + ("000000" + hex).slice(-6);
}

function updateLives() {
  if (!livesEl) return;
  livesEl.innerHTML = "";
  for (let i = 0; i < player.lives; i++) {
    const d = document.createElement("div");
    d.className = "life";
    livesEl.appendChild(d);
  }
}

function toggleMusic() {
  musicOn = !musicOn;
  localStorage.setItem("musicOn", JSON.stringify(musicOn));
  if (toggleMusicBtn) toggleMusicBtn.textContent = `Music: ${musicOn ? "On" : "Off"}`;
  if (bgm) {
    try {
      if (musicOn && player.start) bgm.play(); else bgm.pause();
    } catch {}
  }
}

function toggleDayNight() {
  document.body.classList.toggle("night");
}

function applyEnvironment() {
  const body = document.body;
  body.classList.remove("env-jungle", "env-city", "env-desert");
}

function pickLane(desiredY) {
  const indices = [0, 1, 2].sort(() => Math.random() - 0.5);
  for (const lane of indices) {
    let ok = true;
    for (const other of enemies) {
      if (!other) continue;
      const otherLane = parseInt(other.dataset.lane ?? "-1", 10);
      const otherY = typeof other.y === "number" ? other.y : 0;
      if (otherLane === lane && Math.abs(otherY - desiredY) < 300) {
        ok = false;
        break;
      }
    }
    if (ok) return lane;
  }
  return indices[0];
}
