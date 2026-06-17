import { getStore } from "@netlify/blobs";
import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

const DB_KEY = "state";
const SECRET_KEY = "system/session-secret";
const SESSION_COOKIE = "pedido_session";
const SESSION_DAYS = 7;

const PERMISSIONS = [
  "products",
  "orders",
  "clients",
  "finance",
  "reports",
  "settings",
  "users",
  "logs"
];

const DEFAULT_SETTINGS = {
  companyName: "Sistema de Pedidos",
  logoUrl: "",
  coverUrl:
    "https://images.unsplash.com/photo-1556741533-411cf82e4e2d?auto=format&fit=crop&w=1600&q=80",
  primaryColor: "#0f766e",
  secondaryColor: "#f97316",
  accentColor: "#2563eb",
  contact: {
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    site: ""
  },
  socials: {
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
    linkedin: "",
    other: "",
    otherLabel: "Contato"
  }
};

const dbStore = getStore({ name: "pedido-db", consistency: "strong" });
const fileStore = getStore({ name: "pedido-files", consistency: "strong" });
const secretStore = getStore({ name: "pedido-secrets", consistency: "strong" });

export const config = {
  path: "/api/*"
};

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, "");
    const parts = route.split("/").filter(Boolean);

    if (req.method === "GET" && parts[0] === "state") {
      const db = await loadDb();
      const user = await getSessionUser(req, db);
      return jsonResponse(sanitizeState(db, user));
    }

    if (req.method === "GET" && parts[0] === "files") {
      return await serveFile(parts.slice(1).join("/"));
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Método não permitido." }, 405);
    }

    const body = await readJson(req);

    if (parts[0] === "setup") return await setupMaster(req, body);
    if (parts[0] === "login") return await login(req, body);
    if (parts[0] === "logout") return await logout(req);
    if (parts[0] === "register") return await register(req, body);
    if (parts[0] === "password") return await changePassword(req, body);
    if (parts[0] === "upload") return await uploadFile(req, body);
    if (parts[0] === "products") return await productsAction(req, parts[1], body);
    if (parts[0] === "settings") return await settingsAction(req, body);
    if (parts[0] === "users") return await usersAction(req, parts[1], body);
    if (parts[0] === "orders") return await ordersAction(req, parts[1], body);

    return jsonResponse({ error: "Rota não encontrada." }, 404);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error.message || "Erro interno." }, error.status || 500);
  }
}

async function loadDb() {
  const db = await dbStore.get(DB_KEY, { type: "json" });
  if (db) {
    return {
      settings: { ...DEFAULT_SETTINGS, ...(db.settings || {}) },
      products: db.products || [],
      users: db.users || [],
      orders: db.orders || [],
      logs: db.logs || [],
      createdAt: db.createdAt || new Date().toISOString(),
      updatedAt: db.updatedAt || ""
    };
  }

  const fresh = {
    settings: DEFAULT_SETTINGS,
    products: [],
    users: [],
    orders: [],
    logs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await saveDb(fresh);
  return fresh;
}

async function saveDb(db) {
  db.updatedAt = new Date().toISOString();
  await dbStore.setJSON(DB_KEY, db);
}

async function setupMaster(req, payload) {
  const db = await loadDb();
  if (db.users.some((user) => user.role === "master")) {
    throw httpError(409, "O Administrador Master inicial já foi criado.");
  }

  requireFields(payload, ["name", "username", "email", "password"]);
  assertPassword(payload.password);
  ensureUniqueUser(db, payload.username, payload.email);

  const user = {
    id: id("master"),
    username: payload.username.trim(),
    usernameLower: payload.username.trim().toLowerCase(),
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    role: "master",
    permissions: Object.fromEntries(PERMISSIONS.map((permission) => [permission, true])),
    mustChangePassword: false,
    createdAt: now(),
    lastLogin: now(),
    ...hashPassword(payload.password)
  };

  db.users.push(user);
  addLog(db, "Configuração inicial", `${user.username} criou o Administrador Master.`);
  await saveDb(db);

  const token = await signSession({ sub: user.id });
  return jsonResponse(sanitizeState(db, safeUser(user)), 200, {
    "Set-Cookie": sessionCookie(req, token)
  });
}

async function login(req, payload) {
  const db = await loadDb();
  requireFields(payload, ["username", "password"]);

  const loginValue = payload.username.trim().toLowerCase();
  const user = db.users.find(
    (item) => item.usernameLower === loginValue || item.email?.toLowerCase() === loginValue
  );
  if (!user || !verifyPassword(payload.password, user)) {
    throw httpError(401, "Usuário ou senha inválidos.");
  }

  user.lastLogin = now();
  addLog(db, "Login", `${user.username} acessou o sistema.`);
  await saveDb(db);

  const token = await signSession({ sub: user.id });
  return jsonResponse(sanitizeState(db, safeUser(user)), 200, {
    "Set-Cookie": sessionCookie(req, token)
  });
}

async function logout(req) {
  const db = await loadDb();
  return jsonResponse(sanitizeState(db, null), 200, {
    "Set-Cookie": clearSessionCookie(req)
  });
}

async function register(req, payload) {
  const db = await loadDb();
  if (!db.users.some((user) => user.role === "master")) {
    throw httpError(409, "Crie o Administrador Master antes de cadastrar clientes.");
  }

  requireFields(payload, ["name", "username", "email", "password"]);
  assertPassword(payload.password);
  ensureUniqueUser(db, payload.username, payload.email);

  const user = {
    id: id("user"),
    username: payload.username.trim(),
    usernameLower: payload.username.trim().toLowerCase(),
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    role: "client",
    permissions: {},
    mustChangePassword: false,
    createdAt: now(),
    lastLogin: now(),
    ...hashPassword(payload.password)
  };

  db.users.push(user);
  addLog(db, "Cadastro", `${user.username} criou uma conta de cliente.`);
  await saveDb(db);

  const token = await signSession({ sub: user.id });
  return jsonResponse(sanitizeState(db, safeUser(user)), 200, {
    "Set-Cookie": sessionCookie(req, token)
  });
}

async function changePassword(req, payload) {
  const { db, user } = await requireAuth(req);
  requireFields(payload, ["currentPassword", "newPassword"]);
  assertPassword(payload.newPassword);

  if (!verifyPassword(payload.currentPassword, user)) {
    throw httpError(401, "Senha atual inválida.");
  }

  Object.assign(user, hashPassword(payload.newPassword), { mustChangePassword: false });
  addLog(db, "Senha alterada", `${user.username} alterou a própria senha.`);
  await saveDb(db);
  return jsonResponse(sanitizeState(db, safeUser(user)));
}

async function uploadFile(req, payload) {
  const { db, user } = await requireAuth(req);
  const folder = payload.folder === "branding" ? "branding" : "products";
  if (folder === "branding") requirePermission(user, "settings");
  if (folder === "products") requirePermission(user, "products");

  requireFields(payload, ["fileName", "mimeType", "dataUrl"]);
  if (!String(payload.mimeType).startsWith("image/")) {
    throw httpError(400, "Envie apenas arquivos de imagem.");
  }

  const match = String(payload.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw httpError(400, "Arquivo inválido.");

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) {
    throw httpError(413, "Imagem maior que 5 MB.");
  }

  const key = `${folder}/${id("img")}-${slugify(payload.fileName)}`;
  await fileStore.set(key, buffer, {
    metadata: {
      contentType: payload.mimeType,
      uploadedBy: user.id,
      uploadedAt: now()
    }
  });

  addLog(db, "Upload de imagem", `${user.username} enviou ${payload.fileName}.`);
  await saveDb(db);
  return jsonResponse({ url: `/api/files/${encodeURIComponent(key)}` });
}

async function productsAction(req, action, payload) {
  const { db, user } = await requireAuth(req);
  requirePermission(user, "products");

  if (action === "save") {
    requireFields(payload, ["name", "price", "stock"]);
    const product = {
      id: payload.id || id("prod"),
      name: payload.name.trim(),
      description: payload.description?.trim() || "",
      price: Number(payload.price || 0),
      stock: Math.max(0, Math.floor(Number(payload.stock || 0))),
      imageUrl: payload.imageUrl || "",
      createdAt: payload.createdAt || now(),
      updatedAt: now()
    };

    const index = db.products.findIndex((item) => item.id === product.id);
    if (index >= 0) {
      db.products[index] = { ...db.products[index], ...product };
      addLog(db, "Produto editado", product.name);
    } else {
      db.products.push(product);
      addLog(db, "Produto criado", product.name);
    }
    await saveDb(db);
    return jsonResponse(sanitizeState(db, user));
  }

  if (action === "delete") {
    requireFields(payload, ["id"]);
    db.products = db.products.filter((product) => product.id !== payload.id);
    addLog(db, "Produto excluído", payload.id);
    await saveDb(db);
    return jsonResponse(sanitizeState(db, user));
  }

  throw httpError(404, "Ação de produto não encontrada.");
}

async function settingsAction(req, payload) {
  const { db, user } = await requireAuth(req);
  requirePermission(user, "settings");

  db.settings = {
    ...db.settings,
    ...payload,
    contact: { ...(db.settings.contact || {}), ...(payload.contact || {}) },
    socials: { ...(db.settings.socials || {}), ...(payload.socials || {}) }
  };
  addLog(db, "Configurações", "Identidade visual ou contato atualizado.");
  await saveDb(db);
  return jsonResponse(sanitizeState(db, user));
}

async function usersAction(req, action, payload) {
  const { db, user } = await requireAuth(req);
  requirePermission(user, "users");

  if (action === "save") {
    requireFields(payload, ["name", "username", "email", "role"]);
    if (payload.role !== "client" && user.role !== "master") {
      throw httpError(403, "Somente o Master pode criar ou alterar administradores.");
    }

    const role = payload.role === "master" ? "master" : payload.role === "admin" ? "admin" : "client";
    const permissions =
      role === "master"
        ? Object.fromEntries(PERMISSIONS.map((permission) => [permission, true]))
        : role === "admin"
          ? Object.fromEntries(PERMISSIONS.map((permission) => [permission, Boolean(payload.permissions?.[permission])]))
          : {};

    if (payload.id) {
      const existing = db.users.find((item) => item.id === payload.id);
      if (!existing) throw httpError(404, "Usuário não encontrado.");
      const usernameLower = payload.username.trim().toLowerCase();
      const emailLower = payload.email.trim().toLowerCase();
      if (
        db.users.some(
          (item) =>
            item.id !== payload.id &&
            (item.usernameLower === usernameLower || item.email?.toLowerCase() === emailLower)
        )
      ) {
        throw httpError(409, "Usuário ou e-mail já cadastrado.");
      }
      if (existing.role === "master" && role !== "master") {
        throw httpError(403, "O Master principal não pode ser rebaixado.");
      }
      if (existing.role !== "client" && user.role !== "master") {
        throw httpError(403, "Somente o Master pode alterar administradores.");
      }
      existing.name = payload.name.trim();
      existing.email = payload.email.trim().toLowerCase();
      existing.role = role;
      existing.permissions = permissions;
      existing.updatedAt = now();
      addLog(db, "Usuário editado", existing.username);
    } else {
      requireFields(payload, ["password"]);
      assertPassword(payload.password);
      ensureUniqueUser(db, payload.username, payload.email);
      db.users.push({
        id: id("user"),
        username: payload.username.trim(),
        usernameLower: payload.username.trim().toLowerCase(),
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        role,
        permissions,
        mustChangePassword: true,
        createdAt: now(),
        lastLogin: "",
        ...hashPassword(payload.password)
      });
      addLog(db, "Usuário criado", payload.username);
    }

    await saveDb(db);
    return jsonResponse(sanitizeState(db, user));
  }

  if (action === "delete") {
    requireFields(payload, ["id"]);
    const target = db.users.find((item) => item.id === payload.id);
    if (!target) return jsonResponse(sanitizeState(db, user));
    if (target.role === "master") throw httpError(403, "O Master não pode ser excluído.");
    db.users = db.users.filter((item) => item.id !== payload.id);
    addLog(db, "Usuário excluído", target.username);
    await saveDb(db);
    return jsonResponse(sanitizeState(db, user));
  }

  if (action === "reset-password") {
    requireFields(payload, ["id", "password"]);
    assertPassword(payload.password);
    const target = db.users.find((item) => item.id === payload.id);
    if (!target) throw httpError(404, "Usuário não encontrado.");
    if (target.role !== "client" && user.role !== "master") {
      throw httpError(403, "Somente o Master pode redefinir senha de administradores.");
    }
    Object.assign(target, hashPassword(payload.password), { mustChangePassword: true });
    addLog(db, "Senha redefinida", target.username);
    await saveDb(db);
    return jsonResponse(sanitizeState(db, user));
  }

  throw httpError(404, "Ação de usuário não encontrada.");
}

async function ordersAction(req, action, payload) {
  const { db, user } = await requireAuth(req);

  if (action === "place") {
    requireFields(payload, ["items"]);
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw httpError(400, "Pedido vazio.");
    }

    const orderItems = payload.items.map((item) => {
      const product = db.products.find((entry) => entry.id === item.productId);
      const qty = Math.max(1, Math.floor(Number(item.qty || 1)));
      if (!product) throw httpError(404, "Produto não encontrado.");
      if (Number(product.stock || 0) < qty) {
        throw httpError(409, `Estoque insuficiente para ${product.name}.`);
      }
      return {
        productId: product.id,
        name: product.name,
        qty,
        price: Number(product.price || 0),
        subtotal: qty * Number(product.price || 0)
      };
    });

    orderItems.forEach((item) => {
      const product = db.products.find((entry) => entry.id === item.productId);
      product.stock = Number(product.stock || 0) - item.qty;
      product.updatedAt = now();
    });

    const order = {
      id: id("order"),
      number: String(db.orders.length + 1).padStart(5, "0"),
      clientId: user.id,
      clientName: user.name || user.username,
      items: orderItems,
      total: orderItems.reduce((sum, item) => sum + item.subtotal, 0),
      amountPaid: 0,
      status: "open",
      createdAt: now()
    };

    db.orders.push(order);
    addLog(db, "Pedido criado", `${user.username} fez o pedido #${order.number}.`);
    await saveDb(db);
    return jsonResponse(sanitizeState(db, user));
  }

  requirePermission(user, "orders");

  if (action === "update") {
    requireFields(payload, ["id", "updates"]);
    const order = db.orders.find((item) => item.id === payload.id);
    if (!order) throw httpError(404, "Pedido não encontrado.");

    const updates = payload.updates || {};
    if (updates.status === "paid") {
      order.status = "paid";
      order.amountPaid = Number(order.total || 0);
      order.paidAt = now();
    }
    order.updatedAt = now();
    addLog(db, "Pedido atualizado", payload.id);
    await saveDb(db);
    return jsonResponse(sanitizeState(db, user));
  }

  if (action === "cancel") {
    requireFields(payload, ["id"]);
    const order = db.orders.find((item) => item.id === payload.id);
    if (!order) throw httpError(404, "Pedido não encontrado.");
    if (order.status !== "canceled") {
      order.items.forEach((item) => {
        const product = db.products.find((entry) => entry.id === item.productId);
        if (product) product.stock = Number(product.stock || 0) + Number(item.qty || 0);
      });
      order.status = "canceled";
      order.updatedAt = now();
      addLog(db, "Pedido cancelado", payload.id);
      await saveDb(db);
    }
    return jsonResponse(sanitizeState(db, user));
  }

  throw httpError(404, "Ação de pedido não encontrada.");
}

async function serveFile(encodedKey) {
  const key = decodeURIComponent(encodedKey || "");
  if (!key) throw httpError(404, "Arquivo não encontrado.");
  const metadata = await fileStore.getMetadata(key);
  const data = await fileStore.get(key, { type: "arrayBuffer" });
  if (!data) throw httpError(404, "Arquivo não encontrado.");
  return new Response(data, {
    headers: {
      "Content-Type": metadata?.metadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}

async function requireAuth(req) {
  const db = await loadDb();
  const user = await getSessionUser(req, db);
  if (!user) throw httpError(401, "Faça login para continuar.");
  return { db, user };
}

async function getSessionUser(req, db) {
  const token = parseCookies(req.headers.get("cookie") || "")[SESSION_COOKIE];
  if (!token) return null;
  const session = await verifySession(token);
  if (!session?.sub) return null;
  const user = db.users.find((item) => item.id === session.sub);
  return user || null;
}

function requirePermission(user, permission) {
  if (!can(user, permission)) {
    throw httpError(403, "Você não tem permissão para esta ação.");
  }
}

function can(user, permission) {
  if (!user) return false;
  if (user.role === "master") return true;
  if (user.role !== "admin") return false;
  return Boolean(user.permissions?.[permission]);
}

function sanitizeState(db, user) {
  const currentUser = safeUser(user);
  const isAdmin = user?.role === "master" || user?.role === "admin";
  const orders = isAdmin
    ? db.orders
    : user
      ? db.orders.filter((order) => order.clientId === user.id)
      : [];

  return {
    settings: db.settings,
    products: db.products,
    users: isAdmin ? db.users.map(safeUser) : currentUser ? [currentUser] : [],
    orders,
    logs: user?.role === "master" ? db.logs : [],
    currentUser,
    needsSetup: !db.users.some((item) => item.role === "master"),
    dataMode: "api"
  };
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...profile } = user;
  return profile;
}

function ensureUniqueUser(db, username, email) {
  const usernameLower = username.trim().toLowerCase();
  const emailLower = email.trim().toLowerCase();
  if (db.users.some((user) => user.usernameLower === usernameLower || user.email?.toLowerCase() === emailLower)) {
    throw httpError(409, "Usuário ou e-mail já cadastrado.");
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { passwordSalt: salt, passwordHash: hash };
}

function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = scryptSync(password, user.passwordSalt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function assertPassword(password) {
  if (!password || String(password).length < 8) {
    throw httpError(400, "Use uma senha com pelo menos 8 caracteres.");
  }
}

async function getSecret() {
  let secret = await secretStore.get(SECRET_KEY);
  if (!secret) {
    secret = randomBytes(48).toString("hex");
    await secretStore.set(SECRET_KEY, secret);
  }
  return secret;
}

async function signSession(payload) {
  const secret = await getSecret();
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60
  };
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const content = base64url(JSON.stringify(body));
  const signature = base64url(createHmac("sha256", secret).update(`${header}.${content}`).digest());
  return `${header}.${content}.${signature}`;
}

async function verifySession(token) {
  const secret = await getSecret();
  const [header, content, signature] = String(token).split(".");
  if (!header || !content || !signature) return null;
  const expected = base64url(createHmac("sha256", secret).update(`${header}.${content}`).digest());
  if (expected !== signature) return null;
  const payload = JSON.parse(Buffer.from(content.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function sessionCookie(req, token) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`;
}

function clearSessionCookie(req) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function addLog(db, action, message) {
  db.logs.push({
    id: id("log"),
    action,
    message,
    createdAt: now()
  });
  db.logs = db.logs.slice(-300);
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === "");
  if (missing.length) throw httpError(400, `Campos obrigatórios: ${missing.join(", ")}.`);
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function id(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function base64url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function slugify(text) {
  return String(text || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-|-$/g, "");
}
