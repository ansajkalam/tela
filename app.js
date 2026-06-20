const tileRow = document.querySelector("#tileRow");
const nameInput = document.querySelector("#nameInput");
const shuffleButton = document.querySelector("#shuffleButton");
const saveButton = document.querySelector("#saveButton");
const mobileContext = document.querySelector("#mobileContext");
const mobileQuery = window.matchMedia("(max-width: 720px)");

let alphabet = {};
let variationSeed = 0;
let activeTile = null;
let lastPointerToggleAt = 0;

bootstrap();

async function bootstrap() {
  const response = await fetch("approved-alphabet-images.json", { cache: "no-store" });
  const images = await response.json();
  alphabet = groupByLetter(images.filter((image) => image.approved));

  nameInput.addEventListener("input", renderName);
  shuffleButton.addEventListener("click", shuffleVariation);
  saveButton.addEventListener("click", saveDesign);
  document.addEventListener("click", closeActiveTile);
  preloadAlphabetImages();
  nameInput.value = "tela";
  renderName();
}

function groupByLetter(images) {
  return images.reduce((grouped, image) => {
    const letter = image.letter?.toUpperCase();
    if (!letter) return grouped;
    grouped[letter] ||= [];
    grouped[letter].push(image);
    return grouped;
  }, {});
}

function preloadAlphabetImages() {
  Object.values(alphabet).flat().forEach((item) => {
    const image = new Image();
    image.src = item.imageUrl;
  });
}

function renderName() {
  const lines = parseLines(nameInput.value);
  tileRow.innerHTML = "";
  closeActiveTile();

  if (!lines.flat().length) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "A-Z";
    tileRow.append(placeholder);
    return;
  }

  let globalIndex = 0;
  const usedByLetter = {};
  lines.forEach((letters, lineIndex) => {
    const line = document.createElement("div");
    line.className = "tile-line";

    letters.forEach((letter, index) => {
      const image = chooseImage(letter, index, lineIndex, usedByLetter);
      const tile = document.createElement("div");
      tile.className = image ? "tile" : "tile tile-fallback";
      tile.style.setProperty("--delay", `${globalIndex * 70}ms`);

      if (image) {
        applyCrop(tile, image);
        tile.tabIndex = 0;
        tile.setAttribute("aria-label", `${letter} - ${image.displayContext || image.description || image.title || "real image"}`);
        tile.append(createTooltip(letter, image));
        tile.addEventListener("click", toggleTileContext);
        tile.addEventListener("pointerup", toggleTileContext);
      } else {
        tile.textContent = letter;
      }

      line.append(tile);
      globalIndex += 1;
    });

    tileRow.append(line);
  });
}

function toggleTileContext(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.type === "pointerup") lastPointerToggleAt = Date.now();
  if (event.type === "click" && Date.now() - lastPointerToggleAt < 450) return;
  const tile = event.currentTarget;
  if (activeTile && activeTile !== tile) {
    activeTile.classList.remove("active", "is-open");
  }
  const shouldOpen = !tile.classList.contains("is-open");
  tile.classList.toggle("active", shouldOpen);
  tile.classList.toggle("is-open", shouldOpen);
  activeTile = shouldOpen ? tile : null;
  renderMobileContext(shouldOpen ? tile : null);
}

function closeActiveTile(event) {
  if (!activeTile) return;
  if (event?.target?.closest?.(".tile")) return;
  activeTile.classList.remove("active", "is-open");
  activeTile = null;
  renderMobileContext(null);
}

function renderMobileContext(tile) {
  if (!mobileContext) return;
  if (!tile || !mobileQuery.matches) {
    mobileContext.hidden = true;
    mobileContext.innerHTML = "";
    return;
  }

  const tooltip = tile.querySelector(".tile-tooltip");
  if (!tooltip) return;
  mobileContext.innerHTML = tooltip.innerHTML;
  mobileContext.hidden = false;
}

mobileQuery.addEventListener("change", () => {
  if (!mobileQuery.matches) renderMobileContext(null);
});

function createTooltip(letter, image) {
  const tooltip = document.createElement("div");
  tooltip.className = "tile-tooltip";

  const title = document.createElement("strong");
  title.textContent = `${letter} - ${image.description || image.title || "Real image"}`;

  const context = document.createElement("span");
  context.textContent = image.displayContext || image.validationNotes || image.description || "";

  const credit = document.createElement("small");
  credit.textContent = image.creditLine || creditFromImage(image);

  tooltip.append(title, context, credit);
  return tooltip;
}

function creditFromImage(image) {
  if (image.creator && !/unknown/i.test(image.creator)) {
    return `Credit: ${image.creator}, via ${image.sourceProvider || "source"}.`;
  }
  return `Credit: ${image.sourceProvider || "source"}.`;
}

function parseLines(value) {
  return value
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((line) => line.replace(/[^A-Z0-9._]/g, "").split("").filter(Boolean));
}

function chooseImage(letter, index, lineIndex, usedByLetter = {}) {
  const options = alphabet[letter] || [];
  if (!options.length) return null;
  usedByLetter[letter] ||= new Set();

  const available = options.filter((option) => !usedByLetter[letter].has(option.imageUrl));
  const pool = available.length ? available : options;
  const seed = `${nameInput.value.toUpperCase()}-${variationSeed}-${lineIndex}-${letter}-${index}`;
  const image = pool[hash(seed) % pool.length];
  usedByLetter[letter].add(image.imageUrl);
  return image;
}

function applyCrop(tile, image) {
  const crop = {
    zoom: 1,
    panX: 50,
    panY: 50,
    ...(image.crop || {})
  };

  tile.style.backgroundImage = `url("${image.imageUrl}")`;
  tile.style.backgroundSize = `${Number(crop.zoom || 1) * 100}% auto`;
  tile.style.backgroundPosition = `${Number(crop.panX ?? 50)}% ${Number(crop.panY ?? 50)}%`;
}

function hash(value) {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) {
    result = ((result << 5) - result + value.charCodeAt(i)) | 0;
  }
  return Math.abs(result);
}

function shuffleVariation() {
  variationSeed += 1;
  renderName();
}

async function saveDesign() {
  const lines = parseLines(nameInput.value);
  if (!lines.flat().length) return;

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const plan = buildExportPlan(lines);
    await drawPlan(ctx, plan);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${nameInput.value.trim().replace(/\s+/g, "-").toLowerCase() || "alphabet"}-story.png`;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save Design";
  }
}

function buildExportPlan(lines) {
  const gap = 10;
  const lineGap = 16;
  const maxLineLength = Math.max(...lines.map((line) => line.length));
  const maxTileWidth = Math.floor((920 - gap * Math.max(maxLineLength - 1, 0)) / Math.max(maxLineLength, 1));
  const tileWidth = Math.min(148, Math.max(64, maxTileWidth));
  const tileHeight = Math.round(tileWidth * 1.5);
  const totalHeight = lines.length * tileHeight + Math.max(lines.length - 1, 0) * lineGap;
  const startY = Math.round((1920 - totalHeight) / 2);

  const usedByLetter = {};

  return lines.map((line, lineIndex) => {
    const lineWidth = line.length * tileWidth + Math.max(line.length - 1, 0) * gap;
    const startX = Math.round((1080 - lineWidth) / 2);
    return line.map((letter, index) => ({
      letter,
      image: chooseImage(letter, index, lineIndex, usedByLetter),
      x: startX + index * (tileWidth + gap),
      y: startY + lineIndex * (tileHeight + lineGap),
      width: tileWidth,
      height: tileHeight
    }));
  }).flat();
}

async function drawPlan(ctx, plan) {
  for (const item of plan) {
    if (!item.image) {
      drawFallbackTile(ctx, item);
      continue;
    }
    const image = await loadImage(item.image.imageUrl);
    drawCroppedImage(ctx, image, item.image.crop || {}, item);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawCroppedImage(ctx, image, crop, box) {
  const zoom = Number(crop.zoom || 1);
  const panX = Number(crop.panX ?? 50) / 100;
  const panY = Number(crop.panY ?? 50) / 100;
  const sourceWidth = image.naturalWidth / zoom;
  const sourceHeight = sourceWidth * (box.height / box.width);
  const maxX = Math.max(image.naturalWidth - sourceWidth, 0);
  const maxY = Math.max(image.naturalHeight - sourceHeight, 0);
  const sx = maxX * panX;
  const sy = maxY * panY;

  ctx.drawImage(image, sx, sy, Math.min(sourceWidth, image.naturalWidth), Math.min(sourceHeight, image.naturalHeight), box.x, box.y, box.width, box.height);
}

function drawFallbackTile(ctx, box) {
  ctx.fillStyle = "#f4f4ef";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.fillStyle = "#7c8277";
  ctx.font = `800 ${Math.floor(box.width * 0.52)}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(box.letter, box.x + box.width / 2, box.y + box.height / 2);
}

