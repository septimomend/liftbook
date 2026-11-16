import { getImage } from "./store.js";
import { t } from "./i18n.js";

/** h("div", {class: "x", onClick: fn}, child, ...) — children may be strings, nodes, arrays, null. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  const add = c => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : String(c));
  };
  children.forEach(add);
  return el;
}

/** Replace el's children; accepts nested arrays, null and false (unlike replaceChildren). */
export function mount(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter(c => c != null && c !== false));
  return el;
}

const urlCache = new Map();

/** Drop cached picture URLs so the next render reads pictures again (after a sync replaced some). */
export function forgetPictures() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

/** "img/x.jpg" as-is; "idb:<id>" -> object URL of the stored picture. */
export async function imgSrc(image) {
  if (!image) return null;
  if (!image.startsWith("idb:")) return image;
  if (urlCache.has(image)) return urlCache.get(image);
  const rec = await getImage(image.slice(4));
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(image, url);
  return url;
}

/** <img> that resolves its source asynchronously; empty placeholder when there's none. */
export function picture(image, cls = "pic") {
  const box = h("div", { class: cls });
  imgSrc(image).then(src => {
    if (src) box.append(h("img", { src, alt: "", loading: "lazy" }));
    else box.classList.add("empty");
  });
  return box;
}

/** Any picked image file -> JPEG blob, at most 800 px on the long side, on white. */
export async function toJpeg(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise(r => canvas.toBlob(r, "image/jpeg", 0.8));
}

export function fmtWeight(w) {
  return w == null ? "—" : t("{w} kg", { w });
}
