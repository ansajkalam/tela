import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const datasetPath = new URL("approved-alphabet-images.json", root);
const sourceDir = new URL("source-images/", root);

await fs.mkdir(sourceDir, { recursive: true });

const data = JSON.parse(await fs.readFile(datasetPath, "utf8"));

for (const [index, item] of data.entries()) {
  const source = item.fullImageUrl || item.originalImageUrl || item.imageUrl;
  if (!source.startsWith("http")) continue;

  const ext = extensionFromUrl(source);
  const letterSlug = item.letter === "_" ? "underscore" : item.letter === "." ? "dot" : item.letter;
  const filename = `${String(index + 1).padStart(3, "0")}-${letterSlug}-${slug(item.title || item.description || "image")}${ext}`;
  const localPath = new URL(`source-images/${filename}`, root);

  try {
    await fs.access(localPath);
  } catch {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed ${response.status}: ${source}`);
    await fs.writeFile(localPath, new Uint8Array(await response.arrayBuffer()));
  }

  item.fullImageUrl = `source-images/${filename}`;
}

await fs.writeFile(datasetPath, `${JSON.stringify(data, null, 2)}\n`);
console.log("Downloaded remote source images where needed.");

function extensionFromUrl(value) {
  const path = new URL(value).pathname.toLowerCase();
  const match = path.match(/\.(png|jpg|jpeg|webp)$/);
  if (!match) return ".png";
  return match[0] === ".jpeg" ? ".jpg" : match[0];
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 46) || "image";
}
