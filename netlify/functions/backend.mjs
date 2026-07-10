import { getStore } from "@netlify/blobs";
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const DB_KEY = "state";
const SECRET_KEY = "session-secret";
const COOKIE = "pedido_session";
const DAYS = 7;
const PERMISSIONS = ["products", "orders", "clients", "finance", "reports", "settings", "users", "logs"];

const DEFAULT_SETTINGS = {
  companyName: "Sistema de Pedidos",
  logoUrl: "",
  coverUrl: "https://images.unsplash.com/photo-1556741533-411cf82e4e2d?auto=format&fit=crop&w=1600&q=80",
  primaryColor: "#0f766e",
  secondaryColor: "#f97316",
  accentColor: "#2563eb",
  contact: { phone: "", whatsapp: "", email: "", address: "", site: "" },
  socials: { instagram: "", facebook: "", tiktok: "", youtube: "", linkedin: "", other: "", otherLabel: "Contato" }
};

export default async function handler(req) {
  try {
    const parts = normalizeRoute(new URL(req.url).pathname).split("/").filter(Boolean);

    if (req.method === "GET" && (!parts.length || parts[0] === "health")) {
      return json({ ok: true, service: "pedido-api", time: now() });
    }
    if (req.method === "GET" && parts[0] === "state") {
      const db = await loadDb();
      const user = await sessionUser(req, db);
      return json(publicState(db, user));
    }
    if (req.method === "GET" && parts[0] === "files") {
      return serveFile(parts.slice(1).join("/"));
    }
    if (req.method !== "POST") return json({ error: "Metodo nao permitido." }, 405);

    const body = await readJson(req);
    if (parts[0] === "setup") return await setup(req, body);
    if (parts[0] === "login") return await login(req, body);
    if (parts[0] === "logout") return await logout(req);
    if (parts[0] === "register") return await register(req, body);
    if (parts[0] === "password") return await changePassword(req, body);
    if (parts[0] === "upload") return await upload(req, body);
    if (parts[0] === "settings") return await saveSettings(req, body);
    if (parts[0] === "products") return await productAction(req, parts[1], body);
    if (parts[0] === "users") return await userAction(req, parts[1], body);
    if (parts[0] === "orders") return await orderAction(req, parts[1], body);
    return json({ error: "Rota nao encontrada." }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: error.message || "Erro interno." }, error.status || 500);
  }
}

function normalizeRoute(pathname) {
  return pathname
    .replace(/^\/api\/?/, "")
    .replace(/^\/\.netlify\/functions\/backend-fixed\/?/, "")
    .replace(/^\/\.netlify\/functions\/backend\/?/, "");
}

function dbStore() {
  return getStore({ name: "pedido-db", consistency: "strong" });
}
function fileStore() {
  return getStore({ name: "pedido-files", consistency: "strong" });
}
function secretStore() {
  return getStore({ name: "pedido-secrets", consistency: "strong" });
}

async function loadDb() {
  const saved = await dbStore().get(DB_KEY, { type: "json" });
  if (saved) {
    return {
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      products: saved.products || [],
      users: saved.users || [],
      orders: saved.orders || [],
      logs: saved.logs || [],
      createdAt: saved.createdAt || now(),
      updatedAt: saved.updatedAt || ""
    };
  }
  const fresh = { settings: DEFAULT_SETTINGS, products: [], users: [], orders: [], logs: [], createdAt: now(), updatedAt: now() };
  await saveDb(fresh);
  return fresh;
}

async function saveDb(db) {
  db.updatedAt = now();
  await dbStore().setJSON(DB_KEY, db);
}

async function setup(req, body) {
  const db = await loadDb();
  if (db.users.some((u) => u.role === "master")) fail(409, "O Administrador Master inicial ja foi criado.");
  required(body, ["name", "username", "email", "password"]);
  strongPassword(body.password);
  uniqueUser(db, body.username, body.email);
  const user = {
    id: id("master"),
    username: body.username.trim(),
    usernameLower: body.username.trim().toLowerCase(),
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    role: "master",
    permissions: Object.fromEntries(PERMISSIONS.map((p) => [p, true])),
    mustChangePassword: false,
    createdAt: now(),
    lastLogin: now(),
    ...hashPassword(body.password)
  };
  db.users.push(user);
  log(db, "Configuracao inicial", `${user.username} criou o Administrador Master.`);
  await saveDb(db);
  return withCookie(req, db, user);
}

async function login(req, body) {
  const db = await loadDb();
  required(body, ["username", "password"]);
  const loginValue = body.username.trim().toLowerCase();
  const user = db.users.find((u) => u.usernameLower === loginValue || u.email?.toLowerCase() === loginValue);
  if (!user || !verifyPassword(body.password, user)) fail(401, "Usuario ou senha invalidos.");
  user.lastLogin = now();
  log(db, "Login", `${user.username} acessou o sistema.`);
  await saveDb(db);
  return withCookie(req, db, user);
}

async function logout(req) {
  const db = await loadDb();
  return json(publicState(db, null), 200, { "Set-Cookie": clearCookie(req) });
}

async function register(req, body) {
  const db = await loadDb();
  if (!db.users.some((u) => u.role === "master")) fail(409, "Crie o Administrador Master antes de cadastrar clientes.");
  required(body, ["name", "username", "email", "password"]);
  strongPassword(body.password);
  uniqueUser(db, body.username, body.email);
  const user = {
    id: id("user"),
    username: body.username.trim(),
    usernameLower: body.username.trim().toLowerCase(),
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    role: "client",
    permissions: {},
    mustChangePassword: false,
    createdAt: now(),
    lastLogin: now(),
    ...hashPassword(body.password)
  };
  db.users.push(user);
  log(db, "Cadastro", `${user.username} criou uma conta de cliente.`);
  await saveDb(db);
  return withCookie(req, db, user);
}

async function changePassword(req, body) {
  const { db, user } = await requireAuth(req);
  required(body, ["currentPassword", "newPassword"]);
  strongPassword(body.newPassword);
  if (!verifyPassword(body.currentPassword, user)) fail(401, "Senha atual invalida.");
  Object.assign(user, hashPassword(body.newPassword), { mustChangePassword: false });
  log(db, "Senha alterada", `${user.username} alterou a propria senha.`);
  await saveDb(db);
  return json(publicState(db, user));
}

async function upload(req, body) {
  const { db, user } = await requireAuth(req);
  const folder = body.folder === "branding" ? "branding" : "products";
  requirePermission(user, folder === "branding" ? "settings" : "products");
  required(body, ["fileName", "mimeType", "dataUrl"]);
  if (!String(body.mimeType).startsWith("image/")) fail(400, "Envie apenas arquivos de imagem.");
  const match = String(body.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) fail(400, "Arquivo invalido.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) fail(413, "Imagem maior que 5 MB.");
  const key = `${folder}/${id("img")}-${slug(body.fileName)}`;
  await fileStore().set(key, buffer, { metadata: { contentType: body.mimeType, uploadedBy: user.id, uploadedAt: now() } });
  log(db, "Upload de imagem", `${user.username} enviou ${body.fileName}.`);
  await saveDb(db);
  return json({ url: `/api/files/${encodeURIComponent(key)}` });
}

async function saveSettings(req, body) {
  const { db, user } = await requireAuth(req);
  requirePermission(user, "settings");
  db.settings = {
    ...db.settings,
    ...body,
    contact: { ...(db.settings.contact || {}), ...(body.contact || {}) },
    socials: { ...(db.settings.socials || {}), ...(body.socials || {}) }
  };
  log(db, "Configuracoes", "Identidade visual ou contato atualizado.");
  await saveDb(db);
  return json(publicState(db, user));
}

async function productAction(req, action, body) {
  const { db, user } = await requireAuth(req);
  requirePermission(user, "products");
  if (action === "save") {
    required(body, ["name", "price", "stock"]);
    const product = {
      id: body.id || id("prod"),
      name: body.name.trim(),
      description: body.description?.trim() || "",
      price: Number(body.price || 0),
      stock: Math.max(0, Math.floor(Number(body.stock || 0))),
      imageUrl: normalizeImageUrl(body.imageUrl || ""),
      createdAt: body.createdAt || now(),
      updatedAt: now()
    };
    const index = db.products.findIndex((p) => p.id === product.id);
    if (index >= 0) db.products[index] = { ...db.products[index], ...product };
    else db.products.push(product);
    log(db, index >= 0 ? "Produto editado" : "Produto criado", product.name);
    await saveDb(db);
    return json(publicState(db, user));
  }
  if (action === "delete") {
    required(body, ["id"]);
    db.products = db.products.filter((p) => p.id !== body.id);
    log(db, "Produto excluido", body.id);
    await saveDb(db);
    return json(publicState(db, user));
  }
  fail(404, "Acao de produto nao encontrada.");
}

async function userAction(req, action, body) {
  const { db, user } = await requireAuth(req);
  requirePermission(user, "users");
  if (action === "save") {
    required(body, ["name", "username", "email", "role"]);
    const role = body.role === "master" ? "master" : body.role === "admin" ? "admin" : "client";
    if (role !== "client" && user.role !== "master") fail(403, "Somente o Master pode criar ou alterar administradores.");
    const permissions = role === "master" ? Object.fromEntries(PERMISSIONS.map((p) => [p, true])) : role === "admin" ? Object.fromEntries(PERMISSIONS.map((p) => [p, Boolean(body.permissions?.[p])])) : {};
    if (body.id) {
      const target = db.users.find((u) => u.id === body.id);
      if (!target) fail(404, "Usuario nao encontrado.");
      const usernameLower = body.username.trim().toLowerCase();
      const emailLower = body.email.trim().toLowerCase();
      if (db.users.some((u) => u.id !== body.id && (u.usernameLower === usernameLower || u.email?.toLowerCase() === emailLower))) fail(409, "Usuario ou e-mail ja cadastrado.");
      if (target.role === "master" && role !== "master") fail(403, "O Master principal nao pode ser rebaixado.");
      target.name = body.name.trim();
      target.email = body.email.trim().toLowerCase();
      target.role = role;
      target.permissions = permissions;
      target.updatedAt = now();
      log(db, "Usuario editado", target.username);
    } else {
      required(body, ["password"]);
      strongPassword(body.password);
      uniqueUser(db, body.username, body.email);
      db.users.push({ id: id("user"), username: body.username.trim(), usernameLower: body.username.trim().toLowerCase(), name: body.name.trim(), email: body.email.trim().toLowerCase(), role, permissions, mustChangePassword: true, createdAt: now(), lastLogin: "", ...hashPassword(body.password) });
      log(db, "Usuario criado", body.username);
    }
    await saveDb(db);
    return json(publicState(db, user));
  }
  if (action === "delete") {
    required(body, ["id"]);
    const target = db.users.find((u) => u.id === body.id);
    if (target?.role === "master") fail(403, "O Master nao pode ser excluido.");
    db.users = db.users.filter((u) => u.id !== body.id);
    if (target) log(db, "Usuario excluido", target.username);
    await saveDb(db);
    return json(publicState(db, user));
  }
  if (action === "reset-password") {
    required(body, ["id", "password"]);
    strongPassword(body.password);
    const target = db.users.find((u) => u.id === body.id);
    if (!target) fail(404, "Usuario nao encontrado.");
    Object.assign(target, hashPassword(body.password), { mustChangePassword: true });
    log(db, "Senha redefinida", target.username);
    await saveDb(db);
    return json(publicState(db, user));
  }
  fail(404, "Acao de usuario nao encontrada.");
}

async function orderAction(req, action, body) {
  const { db, user } = await requireAuth(req);
  if (action === "place") {
    if (!Array.isArray(body.items) || !body.items.length) fail(400, "Pedido vazio.");
    const items = body.items.map((item) => {
      const product = db.products.find((p) => p.id === item.productId);
      const qty = Math.max(1, Math.floor(Number(item.qty || 1)));
      if (!product) fail(404, "Produto nao encontrado.");
      if (Number(product.stock || 0) < qty) fail(409, `Estoque insuficiente para ${product.name}.`);
      return { productId: product.id, name: product.name, qty, price: Number(product.price || 0), subtotal: qty * Number(product.price || 0) };
    });
    for (const item of items) {
      const product = db.products.find((p) => p.id === item.productId);
      product.stock = Number(product.stock || 0) - item.qty;
      product.updatedAt = now();
    }
    db.orders.push({ id: id("order"), number: String(db.orders.length + 1).padStart(5, "0"), clientId: user.id, clientName: user.name || user.username, items, total: items.reduce((s, i) => s + i.subtotal, 0), amountPaid: 0, status: "open", createdAt: now() });
    log(db, "Pedido criado", `${user.username} fez um pedido.`);
    await saveDb(db);
    return json(publicState(db, user));
  }
  requirePermission(user, "orders");
  if (action === "update") {
    required(body, ["id", "updates"]);
    const order = db.orders.find((o) => o.id === body.id);
    if (!order) fail(404, "Pedido nao encontrado.");
    if (body.updates?.status === "paid") {
      order.status = "paid";
      order.amountPaid = Number(order.total || 0);
      order.paidAt = now();
    }
    order.updatedAt = now();
    log(db, "Pedido atualizado", body.id);
    await saveDb(db);
    return json(publicState(db, user));
  }
  if (action === "cancel") {
    required(body, ["id"]);
    const order = db.orders.find((o) => o.id === body.id);
    if (!order) fail(404, "Pedido nao encontrado.");
    if (order.status !== "canceled") {
      for (const item of order.items || []) {
        const product = db.products.find((p) => p.id === item.productId);
        if (product) product.stock = Number(product.stock || 0) + Number(item.qty || 0);
      }
      order.status = "canceled";
      order.updatedAt = now();
      log(db, "Pedido cancelado", body.id);
      await saveDb(db);
    }
    return json(publicState(db, user));
  }
  fail(404, "Acao de pedido nao encontrada.");
}

async function serveFile(encodedKey) {
  const key = decodeURIComponent(encodedKey || "");
  if (!key) fail(404, "Arquivo nao encontrado.");
  const [meta, data] = await Promise.all([fileStore().getMetadata(key), fileStore().get(key, { type: "arrayBuffer" })]);
  if (!data) fail(404, "Arquivo nao encontrado.");
  return new Response(data, { headers: { "Content-Type": meta?.metadata?.contentType || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" } });
}

async function requireAuth(req) {
  const db = await loadDb();
  const user = await sessionUser(req, db);
  if (!user) fail(401, "Faca login para continuar.");
  return { db, user };
}

async function sessionUser(req, db) {
  const token = cookies(req.headers.get("cookie") || "")[COOKIE];
  if (!token) return null;
  const data = await verifySession(token);
  return data?.sub ? db.users.find((u) => u.id === data.sub) || null : null;
}

async function withCookie(req, db, user) {
  const token = await signSession({ sub: user.id });
  return json(publicState(db, user), 200, { "Set-Cookie": setCookie(req, token) });
}

function publicState(db, user) {
  const currentUser = safeUser(user);
  const isAdmin = user?.role === "master" || user?.role === "admin";
  return {
    settings: db.settings,
    products: db.products,
    users: isAdmin ? db.users.map(safeUser) : currentUser ? [currentUser] : [],
    orders: isAdmin ? db.orders : user ? db.orders.filter((o) => o.clientId === user.id) : [],
    logs: user?.role === "master" ? db.logs : [],
    currentUser,
    needsSetup: !db.users.some((u) => u.role === "master"),
    dataMode: "api"
  };
}

function requirePermission(user, permission) {
  if (!can(user, permission)) fail(403, "Voce nao tem permissao para esta acao.");
}
function can(user, permission) {
  if (!user) return false;
  if (user.role === "master") return true;
  return user.role === "admin" && Boolean(user.permissions?.[permission]);
}
function safeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...profile } = user;
  return profile;
}
function uniqueUser(db, username, email) {
  const usernameLower = username.trim().toLowerCase();
  const emailLower = email.trim().toLowerCase();
  if (db.users.some((u) => u.usernameLower === usernameLower || u.email?.toLowerCase() === emailLower)) fail(409, "Usuario ou e-mail ja cadastrado.");
}
function hashPassword(password) {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, passwordSalt, 64).toString("hex");
  return { passwordSalt, passwordHash };
}
function verifyPassword(password, user) {
  const expected = Buffer.from(user.passwordHash || "", "hex");
  const actual = scryptSync(password, user.passwordSalt || "", 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function strongPassword(password) {
  if (!password || String(password).length < 8) fail(400, "Use uma senha com pelo menos 8 caracteres.");
}
async function secret() {
  let value = await secretStore().get(SECRET_KEY);
  if (!value) {
    value = randomBytes(48).toString("hex");
    await secretStore().set(SECRET_KEY, value);
  }
  return value;
}
async function signSession(payload) {
  const data = { ...payload, exp: Math.floor(Date.now() / 1000) + DAYS * 86400 };
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(data));
  const sig = b64(createHmac("sha256", await secret()).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
async function verifySession(token) {
  const [header, body, sig] = String(token).split(".");
  if (!header || !body || !sig) return null;
  const expected = b64(createHmac("sha256", await secret()).update(`${header}.${body}`).digest());
  if (expected !== sig) return null;
  const data = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  return data.exp > Math.floor(Date.now() / 1000) ? data : null;
}
function setCookie(req, token) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure}`;
}
function clearCookie(req) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
function cookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const index = p.indexOf("=");
        return index >= 0 ? [p.slice(0, index), decodeURIComponent(p.slice(index + 1))] : [p, ""];
      })
  );
}
function log(db, action, message) {
  db.logs.push({ id: id("log"), action, message, createdAt: now() });
  db.logs = db.logs.slice(-300);
}
async function readJson(req) {
  try {
    const text = await req.text();
    if (!text || !text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}
function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length) fail(400, `Campos obrigatorios: ${missing.join(", ")}.`);
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function id(prefix) {
  return `${prefix}-${randomUUID()}`;
}
function now() {
  return new Date().toISOString();
}
function b64(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function slug(text) {
  return String(text || "arquivo").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}
function normalizeImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  const driveId = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i)?.[1] || value.match(/[?&]id=([^&]+)/i)?.[1];
  if (driveId && /drive\.google\.com/i.test(value)) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`;
  return value;
}
