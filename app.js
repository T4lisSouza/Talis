const STORAGE_KEY = "empresa-pedidos-demo-v2";
const SESSION_KEY = "empresa-pedidos-session-v2";

const PERMISSIONS = [
  ["products", "Produtos"],
  ["orders", "Pedidos"],
  ["clients", "Clientes"],
  ["finance", "Financeiro"],
  ["reports", "Relatórios"],
  ["settings", "Personalização"],
  ["users", "Usuários"],
  ["logs", "Logs"]
];

const ADMIN_TABS = [
  ["overview", "Resumo", "layout-dashboard", null],
  ["products", "Produtos", "package-plus", "products"],
  ["orders", "Pedidos", "clipboard-list", "orders"],
  ["clients", "Clientes", "users", "clients"],
  ["finance", "Financeiro", "wallet-cards", "finance"],
  ["settings", "Marca", "palette", "settings"],
  ["users", "Usuários", "user-cog", "users"],
  ["logs", "Logs", "history", "logs"]
];

const SOCIALS = [
  ["instagram", "Instagram", "instagram"],
  ["facebook", "Facebook", "facebook"],
  ["tiktok", "TikTok", "music-2"],
  ["youtube", "YouTube", "youtube"],
  ["linkedin", "LinkedIn", "linkedin"],
  ["other", "Outra", "link"]
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

const SAMPLE_PRODUCTS = [
  {
    id: "prod-cafe",
    name: "Café Especial 500g",
    description: "Café torrado em grãos com perfil doce, ideal para pedidos recorrentes.",
    price: 32.9,
    stock: 10,
    imageUrl:
      "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=900&q=80",
    createdAt: new Date().toISOString()
  },
  {
    id: "prod-mel",
    name: "Mel Puro 450g",
    description: "Produto artesanal com controle de estoque e histórico financeiro por cliente.",
    price: 24.5,
    stock: 18,
    imageUrl:
      "https://images.unsplash.com/photo-1587049352851-8d4e89133924?auto=format&fit=crop&w=900&q=80",
    createdAt: new Date().toISOString()
  },
  {
    id: "prod-kit",
    name: "Kit Presente",
    description: "Composição pronta para venda, com baixa automática ao confirmar o pedido.",
    price: 79.9,
    stock: 6,
    imageUrl:
      "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=900&q=80",
    createdAt: new Date().toISOString()
  }
];

const state = {
  settings: structuredClone(DEFAULT_SETTINGS),
  products: [],
  users: [],
  orders: [],
  logs: [],
  currentUser: null,
  dataMode: "demo",
  view: "catalog",
  adminTab: "overview",
  authMode: "login",
  search: "",
  cart: {},
  productEditId: null,
  userEditId: null,
  reportMonth: currentMonth(),
  reportClientId: "all",
  needsSetup: false,
  apiError: "",
  loading: true
};

let store = null;

document.addEventListener("DOMContentLoaded", boot);
document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);

async function boot() {
  try {
    if (window.location.protocol !== "file:") {
      store = createApiStore();
    } else {
      store = createLocalStore();
    }

    await store.init((snapshot) => {
      Object.assign(state, snapshot, { loading: false });
      applyBranding();
      render();
    });
  } catch (error) {
    console.error(error);
    if (window.location.protocol === "file:") {
      store = createLocalStore();
      await store.init((snapshot) => {
        Object.assign(state, snapshot, { loading: false, dataMode: "demo" });
        applyBranding();
        render();
      });
      toast("API online indisponível", "O sistema abriu em modo local neste navegador.", "error");
      return;
    }
    state.loading = false;
    state.apiError = "A API online não respondeu. Publique o projeto completo com a pasta netlify/functions.";
    applyBranding();
    render();
  }
}

function render() {
  renderSession();
  renderNav();

  const app = document.getElementById("app");
  if (state.loading) {
    app.innerHTML = `<div class="empty-state">Carregando sistema...</div>`;
    refreshIcons();
    return;
  }

  if (state.apiError) {
    app.innerHTML = `
      <section class="auth-card">
        <h1>API online indisponível</h1>
        <p>${escapeHtml(state.apiError)}</p>
      </section>
    `;
    refreshIcons();
    return;
  }

  if (state.needsSetup && !state.currentUser) {
    app.innerHTML = renderInitialSetup();
    refreshIcons();
    return;
  }

  if (state.currentUser?.mustChangePassword) {
    app.innerHTML = renderPasswordGate();
    refreshIcons();
    return;
  }

  if (state.view === "client") {
    app.innerHTML = state.currentUser ? renderClientArea() : renderAuth("login", "Cliente");
  } else if (state.view === "admin") {
    app.innerHTML = canAccessAdmin() ? renderAdminArea() : renderAuth("login", "Administrador");
  } else if (state.view === "auth") {
    app.innerHTML = renderAuth(state.authMode, "Sistema");
  } else {
    app.innerHTML = renderCatalog();
  }

  refreshIcons();
}

function renderSession() {
  const area = document.getElementById("sessionArea");
  if (!state.currentUser) {
    area.innerHTML = `
      <button class="ghost-button" type="button" data-action="auth" data-mode="login">
        <i data-lucide="log-in"></i>
        Entrar
      </button>
      <button class="primary-button" type="button" data-action="auth" data-mode="register">
        <i data-lucide="user-plus"></i>
        Criar conta
      </button>
    `;
    return;
  }

  area.innerHTML = `
    <span class="user-chip">
      <i data-lucide="${roleIcon(state.currentUser.role)}"></i>
      <span>
        <strong>${escapeHtml(state.currentUser.name || state.currentUser.username)}</strong>
        <small>${roleLabel(state.currentUser.role)}</small>
      </span>
    </span>
    <button class="icon-button" type="button" data-action="logout" title="Sair" aria-label="Sair">
      <i data-lucide="log-out"></i>
    </button>
  `;
}

function renderNav() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });
}

function renderCatalog() {
  const products = filteredProducts();
  const available = state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const publicDebt = state.currentUser ? balanceForUser(state.currentUser.id) : 0;

  return `
    <section class="cover-strip">
      <div>
        <h1>${escapeHtml(state.settings.companyName)}</h1>
        <p>Catálogo online com pedidos, estoque em tempo real, contas de clientes e relatórios mensais em PDF.</p>
      </div>
      <button class="secondary-button" type="button" data-action="go" data-view="${state.currentUser ? "client" : "auth"}" data-mode="login">
        <i data-lucide="shopping-cart"></i>
        Fazer pedido
      </button>
    </section>

    <section class="metric-row" aria-label="Indicadores do catálogo">
      ${metric("Produtos", state.products.length, "Itens cadastrados")}
      ${metric("Estoque", available, "Unidades disponíveis")}
      ${metric("Pedidos", state.orders.length, "Registrados")}
      ${metric("Saldo", money(publicDebt), state.currentUser ? "Sua conta" : "Entre para consultar")}
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Produtos disponíveis</h2>
          <p>Os itens publicados ficam visíveis para todos os visitantes.</p>
        </div>
      </div>
      ${renderProductFilters()}
      ${products.length ? `<div class="product-grid">${products.map(renderProductCard).join("")}</div>` : emptyState("Nenhum produto encontrado.")}
    </section>
  `;
}

function renderProductFilters() {
  return `
    <div class="filters">
      <label class="input-icon">
        <i data-lucide="search"></i>
        <input type="search" data-action="search" placeholder="Buscar produto" value="${escapeAttr(state.search)}" />
      </label>
      <button class="ghost-button" type="button" data-action="clear-search">
        <i data-lucide="x"></i>
        Limpar
      </button>
    </div>
  `;
}

function renderProductCard(product) {
  const stock = Number(product.stock || 0);
  const inCart = Number(state.cart[product.id] || 0);
  const canBuy = stock > 0;
  const isLogged = Boolean(state.currentUser);

  return `
    <article class="product-card">
      <div class="product-image">
        ${
          product.imageUrl
            ? `<img src="${escapeAttr(resolveAssetUrl(product.imageUrl))}" alt="${escapeAttr(product.name)}" loading="lazy" />`
            : `<div class="placeholder"><i data-lucide="image"></i></div>`
        }
      </div>
      <div class="product-body">
        <div class="product-title-row">
          <h3>${escapeHtml(product.name)}</h3>
          ${stockBadge(stock)}
        </div>
        <p class="product-description">${escapeHtml(product.description || "Sem descrição cadastrada.")}</p>
        <div class="product-meta">
          <span class="price">${money(product.price)}</span>
          ${
            isLogged
              ? `<button class="primary-button" type="button" data-action="add-cart" data-id="${product.id}" ${canBuy ? "" : "disabled"}>
                  <i data-lucide="shopping-cart"></i>
                  ${inCart ? `No pedido: ${inCart}` : "Adicionar"}
                </button>`
              : `<button class="ghost-button" type="button" data-action="auth" data-mode="login">
                  <i data-lucide="log-in"></i>
                  Entrar
                </button>`
          }
        </div>
      </div>
    </article>
  `;
}

function renderAuth(mode, context) {
  const isRegister = mode === "register";
  return `
    <section class="auth-card">
      <div class="segment">
        <button type="button" class="${isRegister ? "" : "is-active"}" data-action="auth-mode" data-mode="login">Entrar</button>
        <button type="button" class="${isRegister ? "is-active" : ""}" data-action="auth-mode" data-mode="register">Criar conta</button>
      </div>
      <h1>${isRegister ? "Criar conta" : `Entrar como ${escapeHtml(context)}`}</h1>
      <p>${isRegister ? "Clientes podem criar conta e acompanhar seus pedidos." : "Use seu usuário ou e-mail e senha."}</p>
      ${
        isRegister
          ? `
            <form id="registerForm" class="form-grid">
              <label>Nome completo
                <input name="name" required autocomplete="name" />
              </label>
              <label>Usuário
                <input name="username" required autocomplete="username" />
              </label>
              <label>E-mail
                <input name="email" type="email" required autocomplete="email" />
              </label>
              <label>Senha
                <input name="password" type="password" minlength="8" required autocomplete="new-password" />
              </label>
              <div class="form-actions full">
                <button class="primary-button" type="submit">
                  <i data-lucide="user-plus"></i>
                  Criar conta
                </button>
              </div>
            </form>
          `
          : `
            <form id="loginForm" class="form-grid">
              <label class="full">Usuário ou e-mail
                <input name="username" required autocomplete="username" placeholder="usuario@empresa.com" />
              </label>
              <label class="full">Senha
                <input name="password" type="password" required autocomplete="current-password" />
              </label>
              <div class="form-actions full">
                <button class="primary-button" type="submit">
                  <i data-lucide="log-in"></i>
                  Entrar
                </button>
              </div>
            </form>
          `
      }
    </section>
  `;
}

function renderInitialSetup() {
  return `
    <section class="auth-card">
      <h1>Configuração inicial</h1>
      <p>Crie o primeiro Administrador Master. Não existe usuário ou senha padrão neste sistema.</p>
      <form id="setupForm" class="form-grid">
        <label>Nome completo
          <input name="name" required autocomplete="name" />
        </label>
        <label>Usuário
          <input name="username" required autocomplete="username" />
        </label>
        <label>E-mail
          <input name="email" type="email" required autocomplete="email" />
        </label>
        <label>Senha
          <input name="password" type="password" minlength="8" required autocomplete="new-password" />
          <span class="field-hint">Use uma senha forte, com pelo menos 8 caracteres.</span>
        </label>
        <label class="full">Confirmar senha
          <input name="confirmPassword" type="password" minlength="8" required autocomplete="new-password" />
        </label>
        <div class="form-actions full">
          <button class="primary-button" type="submit">
            <i data-lucide="crown"></i>
            Criar Master
          </button>
        </div>
      </form>
    </section>
  `;
}

function renderPasswordGate() {
  return `
    <section class="password-gate">
      <h1>Troque a senha inicial</h1>
      <p>Este usuário está usando a senha padrão. Defina uma nova senha para continuar.</p>
      <form id="passwordForm" class="form-grid">
        <label class="full">Senha atual
          <input name="currentPassword" type="password" required autocomplete="current-password" />
        </label>
        <label>Nova senha
          <input name="newPassword" type="password" minlength="8" required autocomplete="new-password" />
        </label>
        <label>Confirmar senha
          <input name="confirmPassword" type="password" minlength="8" required autocomplete="new-password" />
        </label>
        <div class="form-actions full">
          <button class="primary-button" type="submit">
            <i data-lucide="key-round"></i>
            Salvar senha
          </button>
        </div>
      </form>
    </section>
  `;
}

function renderClientArea() {
  const user = state.currentUser;
  const myOrders = ordersForUser(user.id);
  const balance = balanceForUser(user.id);
  const total = totalForUser(user.id);
  const products = filteredProducts();

  return `
    <div class="toolbar">
      <div class="page-title">
        <h1>Área do cliente</h1>
        <p>${escapeHtml(user.name || user.username)}, acompanhe pedidos, saldo e histórico.</p>
      </div>
      <button class="ghost-button" type="button" data-action="generate-report" data-client="${user.id}" data-month="${currentMonth()}">
        <i data-lucide="file-text"></i>
        PDF do mês
      </button>
    </div>

    <section class="metric-row">
      ${metric("Saldo devedor", money(balance), "Valor em aberto")}
      ${metric("Total comprado", money(total), "Histórico completo")}
      ${metric("Pedidos", myOrders.length, "Compras realizadas")}
      ${metric("Itens no pedido", cartCount(), "Carrinho atual")}
    </section>

    <div class="layout-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Adicionar produtos</h2>
            <p>Ao finalizar, o estoque será atualizado automaticamente.</p>
          </div>
        </div>
        ${renderProductFilters()}
        ${products.length ? `<div class="product-grid">${products.map(renderProductCard).join("")}</div>` : emptyState("Nenhum produto disponível.")}
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h2>Pedido atual</h2>
            <p>${cartCount()} item(ns)</p>
          </div>
        </div>
        ${renderCart()}
      </aside>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Histórico de compras</h2>
          <p>Pedidos e pagamentos registrados para sua conta.</p>
        </div>
      </div>
      ${renderOrdersList(myOrders)}
    </section>
  `;
}

function renderCart() {
  const items = cartItems();
  if (!items.length) {
    return emptyState("Seu pedido está vazio.");
  }

  return `
    <div class="cart-list">
      ${items
        .map(
          ({ product, qty }) => `
          <div class="cart-item">
            <header>
              <strong>${escapeHtml(product.name)}</strong>
              <button class="icon-button is-danger" type="button" data-action="remove-cart" data-id="${product.id}" title="Remover" aria-label="Remover">
                <i data-lucide="trash-2"></i>
              </button>
            </header>
            <div class="quantity-row">
              <button class="icon-button" type="button" data-action="cart-dec" data-id="${product.id}" aria-label="Diminuir">
                <i data-lucide="minus"></i>
              </button>
              <input type="number" min="1" max="${Number(product.stock || 0)}" value="${qty}" data-action="cart-input" data-id="${product.id}" />
              <button class="icon-button" type="button" data-action="cart-inc" data-id="${product.id}" aria-label="Aumentar">
                <i data-lucide="plus"></i>
              </button>
            </div>
            <span class="small-muted">${qty} x ${money(product.price)} = <strong>${money(qty * Number(product.price || 0))}</strong></span>
          </div>
        `
        )
        .join("")}
    </div>
    <div class="form-actions">
      <strong>Total: ${money(cartTotal())}</strong>
      <button class="primary-button" type="button" data-action="checkout">
        <i data-lucide="check-circle-2"></i>
        Finalizar pedido
      </button>
    </div>
  `;
}

function renderAdminArea() {
  const availableTabs = ADMIN_TABS.filter((tab) => !tab[3] || can(tab[3]));
  if (!availableTabs.some((tab) => tab[0] === state.adminTab)) {
    state.adminTab = "overview";
  }

  return `
    <div class="toolbar">
      <div class="page-title">
        <h1>Área administrativa</h1>
        <p>Gestão de produtos, usuários, pedidos, estoque e identidade visual.</p>
      </div>
      <button class="ghost-button" type="button" data-action="change-own-password">
        <i data-lucide="key-round"></i>
        Trocar senha
      </button>
    </div>

    <div class="admin-layout">
      <aside class="admin-tabs">
        ${availableTabs
          .map(
            ([id, label, icon]) => `
              <button type="button" class="tab-button ${state.adminTab === id ? "is-active" : ""}" data-action="admin-tab" data-tab="${id}">
                <i data-lucide="${icon}"></i>
                ${label}
              </button>
            `
          )
          .join("")}
      </aside>
      <section>${renderAdminTab()}</section>
    </div>
  `;
}

function renderAdminTab() {
  switch (state.adminTab) {
    case "products":
      return renderProductsAdmin();
    case "orders":
      return renderOrdersAdmin();
    case "clients":
      return renderClientsAdmin();
    case "finance":
      return renderFinanceAdmin();
    case "settings":
      return renderSettingsAdmin();
    case "users":
      return renderUsersAdmin();
    case "logs":
      return renderLogsAdmin();
    default:
      return renderOverviewAdmin();
  }
}

function renderOverviewAdmin() {
  const stock = state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const revenue = state.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const debt = state.orders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.amountPaid || 0)), 0);
  const lowStock = state.products.filter((product) => Number(product.stock || 0) <= 3).length;

  return `
    <section class="metric-row">
      ${metric("Faturamento", money(revenue), "Total de pedidos")}
      ${metric("A receber", money(debt), "Saldo devedor")}
      ${metric("Estoque", stock, "Unidades")}
      ${metric("Estoque baixo", lowStock, "Produtos com 3 ou menos")}
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Atalhos</h2>
          <p>Operações frequentes do administrador.</p>
        </div>
      </div>
      <div class="form-actions" style="justify-content:flex-start">
        ${can("products") ? shortcut("products", "Produtos", "package-plus") : ""}
        ${can("orders") ? shortcut("orders", "Pedidos", "clipboard-list") : ""}
        ${can("finance") ? shortcut("finance", "Financeiro", "wallet-cards") : ""}
        ${can("settings") ? shortcut("settings", "Marca", "palette") : ""}
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Últimos pedidos</h2>
          <p>Movimentações recentes da empresa.</p>
        </div>
      </div>
      ${renderOrdersList(state.orders.slice().sort(byDateDesc).slice(0, 5), true)}
    </section>
  `;
}

function shortcut(tab, label, icon) {
  return `
    <button class="ghost-button" type="button" data-action="admin-tab" data-tab="${tab}">
      <i data-lucide="${icon}"></i>
      ${label}
    </button>
  `;
}

function renderProductsAdmin() {
  const editing = state.products.find((product) => product.id === state.productEditId);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>${editing ? "Editar produto" : "Cadastrar produto"}</h2>
          <p>Produtos aparecem automaticamente no catálogo público.</p>
        </div>
        ${editing ? `<button class="ghost-button" type="button" data-action="cancel-product-edit"><i data-lucide="x"></i>Cancelar</button>` : ""}
      </div>
      <form id="productForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeAttr(editing?.id || "")}" />
        <label>Nome
          <input name="name" required value="${escapeAttr(editing?.name || "")}" />
        </label>
        <label>Preço
          <input name="price" type="number" step="0.01" min="0" required value="${escapeAttr(editing?.price ?? "")}" />
        </label>
        <label>Estoque
          <input name="stock" type="number" step="1" min="0" required value="${escapeAttr(editing?.stock ?? "")}" />
        </label>
        <label>Imagem por URL
          <input name="imageUrl" type="url" value="${escapeAttr(editing?.imageUrl || "")}" />
        </label>
        <label class="full">Descrição
          <textarea name="description">${escapeHtml(editing?.description || "")}</textarea>
        </label>
        <label class="full">Upload de imagem
          <input name="imageFile" type="file" accept="image/*" />
          <span class="field-hint">A imagem fica salva online e aparece automaticamente para todos os usuarios.</span>
        </label>
        <div class="form-actions full">
          <button class="primary-button" type="submit">
            <i data-lucide="save"></i>
            Salvar produto
          </button>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Produtos cadastrados</h2>
          <p>${state.products.length} item(ns) no catálogo.</p>
        </div>
      </div>
      ${renderProductsTable()}
    </section>
  `;
}

function renderProductsTable() {
  if (!state.products.length) return emptyState("Nenhum produto cadastrado.");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Preço</th>
            <th>Estoque</th>
            <th>Atualizado</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${state.products
            .map(
              (product) => `
              <tr>
                <td><strong>${escapeHtml(product.name)}</strong><br><span class="small-muted">${escapeHtml(product.description || "")}</span></td>
                <td>${money(product.price)}</td>
                <td>${stockBadge(Number(product.stock || 0))}</td>
                <td>${dateShort(product.updatedAt || product.createdAt)}</td>
                <td>
                  <span class="table-actions">
                    <button class="icon-button" type="button" data-action="edit-product" data-id="${product.id}" title="Editar" aria-label="Editar">
                      <i data-lucide="pencil"></i>
                    </button>
                    <button class="icon-button is-danger" type="button" data-action="delete-product" data-id="${product.id}" title="Excluir" aria-label="Excluir">
                      <i data-lucide="trash-2"></i>
                    </button>
                  </span>
                </td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOrdersAdmin() {
  const orders = state.orders.slice().sort(byDateDesc);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Pedidos realizados</h2>
          <p>Visualize, baixe pagamentos e acompanhe o estoque.</p>
        </div>
      </div>
      ${renderOrdersTable(orders)}
    </section>
  `;
}

function renderOrdersTable(orders) {
  if (!orders.length) return emptyState("Nenhum pedido registrado.");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Total</th>
            <th>Status</th>
            <th>Data</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${orders
            .map((order) => {
              const client = userById(order.clientId);
              return `
                <tr>
                  <td><strong>#${escapeHtml(order.number || order.id.slice(0, 8))}</strong><br><span class="small-muted">${order.items.length} item(ns)</span></td>
                  <td>${escapeHtml(client?.name || order.clientName || "Cliente")}</td>
                  <td>${money(order.total)}</td>
                  <td>${statusBadge(order)}</td>
                  <td>${dateShort(order.createdAt)}</td>
                  <td>
                    <span class="table-actions">
                      <button class="icon-button" type="button" data-action="generate-report" data-client="${order.clientId}" data-month="${monthFromDate(order.createdAt)}" title="Gerar PDF" aria-label="Gerar PDF">
                        <i data-lucide="file-text"></i>
                      </button>
                      ${
                        order.status !== "paid"
                          ? `<button class="icon-button" type="button" data-action="mark-paid" data-id="${order.id}" title="Marcar como pago" aria-label="Marcar como pago"><i data-lucide="badge-check"></i></button>`
                          : ""
                      }
                      ${
                        order.status !== "canceled"
                          ? `<button class="icon-button is-danger" type="button" data-action="cancel-order" data-id="${order.id}" title="Cancelar" aria-label="Cancelar"><i data-lucide="ban"></i></button>`
                          : ""
                      }
                    </span>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderClientsAdmin() {
  const clients = state.users.filter((user) => user.role === "client");
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Clientes</h2>
          <p>Contas, saldo devedor e histórico financeiro.</p>
        </div>
      </div>
      ${
        clients.length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>E-mail</th>
                    <th>Pedidos</th>
                    <th>Total</th>
                    <th>Saldo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${clients
                    .map(
                      (client) => `
                      <tr>
                        <td><strong>${escapeHtml(client.name || client.username)}</strong><br><span class="small-muted">@${escapeHtml(client.username)}</span></td>
                        <td>${escapeHtml(client.email || "")}</td>
                        <td>${ordersForUser(client.id).length}</td>
                        <td>${money(totalForUser(client.id))}</td>
                        <td>${money(balanceForUser(client.id))}</td>
                        <td>
                          <span class="table-actions">
                            <button class="icon-button" type="button" data-action="generate-report" data-client="${client.id}" data-month="${state.reportMonth}" title="PDF" aria-label="PDF">
                              <i data-lucide="file-text"></i>
                            </button>
                          </span>
                        </td>
                      </tr>
                    `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState("Nenhum cliente cadastrado.")
      }
    </section>
  `;
}

function renderFinanceAdmin() {
  const clients = state.users.filter((user) => user.role === "client");
  const month = state.reportMonth;
  const selectedOrders = ordersInMonth(month).filter((order) =>
    state.reportClientId === "all" ? true : order.clientId === state.reportClientId
  );
  const total = selectedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const debt = selectedOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.amountPaid || 0)), 0);

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Relatórios financeiros</h2>
          <p>Gere PDF por cliente com histórico mensal de compras.</p>
        </div>
      </div>
      <form id="reportFilterForm" class="form-grid three">
        <label>Mês
          <input type="month" name="month" value="${escapeAttr(month)}" />
        </label>
        <label>Cliente
          <select name="clientId">
            <option value="all"${state.reportClientId === "all" ? " selected" : ""}>Todos os clientes</option>
            ${clients.map((client) => `<option value="${client.id}"${state.reportClientId === client.id ? " selected" : ""}>${escapeHtml(client.name || client.username)}</option>`).join("")}
          </select>
        </label>
        <div class="form-actions" style="align-self:end">
          <button class="primary-button" type="submit">
            <i data-lucide="filter"></i>
            Aplicar
          </button>
          <button class="ghost-button" type="button" data-action="generate-report" data-client="${state.reportClientId}" data-month="${month}">
            <i data-lucide="file-text"></i>
            Gerar PDF
          </button>
        </div>
      </form>
    </section>

    <section class="metric-row">
      ${metric("Período", monthLabel(month), "Mês selecionado")}
      ${metric("Pedidos", selectedOrders.length, "No período")}
      ${metric("Total", money(total), "Compras")}
      ${metric("A receber", money(debt), "Saldo")}
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Movimentação do período</h2>
          <p>Resultado do filtro financeiro.</p>
        </div>
      </div>
      ${renderOrdersTable(selectedOrders)}
    </section>
  `;
}

function renderSettingsAdmin() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Identidade visual</h2>
          <p>As alterações aparecem em todo o sistema e nos relatórios.</p>
        </div>
      </div>
      <form id="settingsForm" class="form-grid">
        <label>Nome da empresa
          <input name="companyName" required value="${escapeAttr(state.settings.companyName)}" />
        </label>
        <label>Logotipo por URL
          <input name="logoUrl" type="url" value="${escapeAttr(state.settings.logoUrl || "")}" />
        </label>
        <label class="full">Imagem de capa por URL
          <input name="coverUrl" type="url" value="${escapeAttr(state.settings.coverUrl || "")}" />
        </label>
        <label>Upload de logotipo
          <input name="logoFile" type="file" accept="image/*" />
        </label>
        <label>Upload de capa
          <input name="coverFile" type="file" accept="image/*" />
        </label>
        <div class="full color-row">
          <label>Cor principal
            <input name="primaryColor" type="color" value="${escapeAttr(state.settings.primaryColor)}" />
          </label>
          <label>Cor secundária
            <input name="secondaryColor" type="color" value="${escapeAttr(state.settings.secondaryColor)}" />
          </label>
          <label>Cor de apoio
            <input name="accentColor" type="color" value="${escapeAttr(state.settings.accentColor)}" />
          </label>
        </div>
        <div class="form-actions full">
          <button class="primary-button" type="submit">
            <i data-lucide="save"></i>
            Salvar identidade
          </button>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Contato e redes sociais</h2>
          <p>Os links aparecem automaticamente no rodapé.</p>
        </div>
      </div>
      <form id="contactForm" class="form-grid">
        <label>Telefone
          <input name="phone" value="${escapeAttr(state.settings.contact?.phone || "")}" />
        </label>
        <label>WhatsApp
          <input name="whatsapp" value="${escapeAttr(state.settings.contact?.whatsapp || "")}" />
        </label>
        <label>E-mail
          <input name="email" type="email" value="${escapeAttr(state.settings.contact?.email || "")}" />
        </label>
        <label>Site oficial
          <input name="site" type="url" value="${escapeAttr(state.settings.contact?.site || "")}" />
        </label>
        <label class="full">Endereço
          <input name="address" value="${escapeAttr(state.settings.contact?.address || "")}" />
        </label>
        <div class="full social-grid">
          ${SOCIALS.map(([key, label]) => {
            if (key === "other") {
              return `
                <label>${label}
                  <input name="other" type="url" value="${escapeAttr(state.settings.socials?.other || "")}" />
                </label>
                <label>Nome da outra rede
                  <input name="otherLabel" value="${escapeAttr(state.settings.socials?.otherLabel || "Contato")}" />
                </label>
              `;
            }
            return `
              <label>${label}
                <input name="${key}" type="url" value="${escapeAttr(state.settings.socials?.[key] || "")}" />
              </label>
            `;
          }).join("")}
        </div>
        <div class="form-actions full">
          <button class="primary-button" type="submit">
            <i data-lucide="save"></i>
            Salvar contato
          </button>
        </div>
      </form>
    </section>
  `;
}

function renderUsersAdmin() {
  if (!can("users")) return emptyState("Sem permissão para gerenciar usuários.");
  const editing = state.users.find((user) => user.id === state.userEditId);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>${editing ? "Editar usuário" : "Criar usuário"}</h2>
          <p>Somente Master pode conceder ou remover permissões administrativas.</p>
        </div>
        ${editing ? `<button class="ghost-button" type="button" data-action="cancel-user-edit"><i data-lucide="x"></i>Cancelar</button>` : ""}
      </div>
      <form id="userForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeAttr(editing?.id || "")}" />
        <label>Nome
          <input name="name" required value="${escapeAttr(editing?.name || "")}" />
        </label>
        <label>Usuário
          <input name="username" required value="${escapeAttr(editing?.username || "")}" ${editing ? "readonly" : ""} />
        </label>
        <label>E-mail
          <input name="email" type="email" required value="${escapeAttr(editing?.email || "")}" />
        </label>
        <label>Perfil
          <select name="role" ${editing?.role === "master" ? "disabled" : ""}>
            <option value="client"${editing?.role === "client" ? " selected" : ""}>Cliente</option>
            <option value="admin"${editing?.role === "admin" ? " selected" : ""}>Administrador</option>
            ${state.currentUser?.role === "master" ? `<option value="master"${editing?.role === "master" ? " selected" : ""}>Master</option>` : ""}
          </select>
        </label>
        ${
          editing
            ? ""
            : `<label class="full">Senha inicial
                <input name="password" type="password" minlength="8" required />
                <span class="field-hint">O usuário deverá trocar a senha no primeiro acesso.</span>
              </label>`
        }
        <div class="full">
          <label>Permissões administrativas</label>
          <div class="permissions-grid">
            ${PERMISSIONS.map(
              ([key, label]) => `
                <label class="check-card">
                  <input type="checkbox" name="perm_${key}" ${editing?.permissions?.[key] ? "checked" : ""} />
                  ${label}
                </label>
              `
            ).join("")}
          </div>
        </div>
        <div class="form-actions full">
          <button class="primary-button" type="submit">
            <i data-lucide="save"></i>
            Salvar usuário
          </button>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Usuários cadastrados</h2>
          <p>${state.users.length} conta(s) no sistema.</p>
        </div>
      </div>
      ${renderUsersTable()}
    </section>
  `;
}

function renderUsersTable() {
  if (!state.users.length) return emptyState("Nenhum usuário cadastrado.");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Perfil</th>
            <th>Último login</th>
            <th>Permissões</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${state.users
            .map(
              (user) => `
              <tr>
                <td><strong>${escapeHtml(user.name || user.username)}</strong><br><span class="small-muted">${escapeHtml(user.email || "")}</span></td>
                <td>${roleBadge(user.role)}</td>
                <td>${user.lastLogin ? dateShort(user.lastLogin) : "Nunca"}</td>
                <td><span class="small-muted">${permissionSummary(user)}</span></td>
                <td>
                  <span class="table-actions">
                    <button class="icon-button" type="button" data-action="edit-user" data-id="${user.id}" title="Editar" aria-label="Editar">
                      <i data-lucide="pencil"></i>
                    </button>
                    <button class="icon-button" type="button" data-action="reset-password" data-id="${user.id}" title="Redefinir senha" aria-label="Redefinir senha">
                      <i data-lucide="key-round"></i>
                    </button>
                    ${
                      user.id !== state.currentUser?.id && user.role !== "master"
                        ? `<button class="icon-button is-danger" type="button" data-action="delete-user" data-id="${user.id}" title="Excluir" aria-label="Excluir"><i data-lucide="trash-2"></i></button>`
                        : ""
                    }
                  </span>
                </td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLogsAdmin() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Logs e histórico</h2>
          <p>Registro de acessos e alterações importantes.</p>
        </div>
      </div>
      ${
        state.logs.length
          ? `<div class="log-list">${state.logs
              .slice()
              .sort(byDateDesc)
              .slice(0, 80)
              .map(
                (log) => `
                <div class="log-item">
                  <header>
                    <strong>${escapeHtml(log.action)}</strong>
                    <span class="small-muted">${dateShort(log.createdAt)}</span>
                  </header>
                  <span class="small-muted">${escapeHtml(log.message || "")}</span>
                </div>
              `
              )
              .join("")}</div>`
          : emptyState("Nenhum log registrado.")
      }
    </section>
  `;
}

function renderOrdersList(orders, compact = false) {
  if (!orders.length) return emptyState("Nenhum pedido encontrado.");
  return `
    <div class="order-list">
      ${orders
        .map(
          (order) => `
          <article class="order-card">
            <header>
              <div>
                <strong>Pedido #${escapeHtml(order.number || order.id.slice(0, 8))}</strong>
                <div class="small-muted">${dateShort(order.createdAt)} · ${escapeHtml(userById(order.clientId)?.name || order.clientName || "Cliente")}</div>
              </div>
              ${statusBadge(order)}
            </header>
            ${
              compact
                ? ""
                : `<ul class="small-muted">
                    ${order.items.map((item) => `<li>${escapeHtml(item.name)} · ${item.qty} x ${money(item.price)}</li>`).join("")}
                  </ul>`
            }
            <strong>${money(order.total)}</strong>
          </article>
        `
        )
        .join("")}
    </div>
  `;
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action } = button.dataset;

  if (action === "go") {
    state.view = button.dataset.view || "catalog";
    if (button.dataset.mode) state.authMode = button.dataset.mode;
    render();
  }

  if (action === "auth") {
    state.view = "auth";
    state.authMode = button.dataset.mode || "login";
    render();
  }

  if (action === "auth-mode") {
    state.authMode = button.dataset.mode || "login";
    render();
  }

  if (action === "logout") {
    await store.logout();
    state.view = "catalog";
    state.cart = {};
    render();
    toast("Sessão encerrada", "Você saiu do sistema.", "success");
  }

  if (action === "search") return;

  if (action === "clear-search") {
    state.search = "";
    render();
  }

  if (action === "add-cart") {
    addToCart(button.dataset.id);
  }

  if (action === "remove-cart") {
    delete state.cart[button.dataset.id];
    render();
  }

  if (action === "cart-inc") {
    changeCartQty(button.dataset.id, 1);
  }

  if (action === "cart-dec") {
    changeCartQty(button.dataset.id, -1);
  }

  if (action === "checkout") {
    await checkout();
  }

  if (action === "admin-tab") {
    state.adminTab = button.dataset.tab || "overview";
    render();
  }

  if (action === "cancel-product-edit") {
    state.productEditId = null;
    render();
  }

  if (action === "edit-product") {
    state.productEditId = button.dataset.id;
    state.adminTab = "products";
    render();
  }

  if (action === "delete-product") {
    await deleteProduct(button.dataset.id);
  }

  if (action === "cancel-user-edit") {
    state.userEditId = null;
    render();
  }

  if (action === "edit-user") {
    state.userEditId = button.dataset.id;
    state.adminTab = "users";
    render();
  }

  if (action === "delete-user") {
    await deleteUser(button.dataset.id);
  }

  if (action === "reset-password") {
    await resetPassword(button.dataset.id);
  }

  if (action === "mark-paid") {
    await markPaid(button.dataset.id);
  }

  if (action === "cancel-order") {
    await cancelOrder(button.dataset.id);
  }

  if (action === "generate-report") {
    await generateReport(button.dataset.client, button.dataset.month);
  }

  if (action === "change-own-password") {
    state.currentUser = { ...state.currentUser, mustChangePassword: true };
    render();
  }
}

async function handleSubmit(event) {
  if (!event.target.matches("form")) return;
  event.preventDefault();
  const form = event.target;

  try {
    if (form.id === "loginForm") await submitLogin(form);
    if (form.id === "registerForm") await submitRegister(form);
    if (form.id === "setupForm") await submitInitialSetup(form);
    if (form.id === "passwordForm") await submitPasswordChange(form);
    if (form.id === "productForm") await submitProduct(form);
    if (form.id === "userForm") await submitUser(form);
    if (form.id === "settingsForm") await submitSettings(form);
    if (form.id === "contactForm") await submitContact(form);
    if (form.id === "reportFilterForm") submitReportFilter(form);
  } catch (error) {
    console.error(error);
    toast("Erro", error.message || "Não foi possível concluir a ação.", "error");
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.action === "search") {
    state.search = target.value;
    render();
    const input = document.querySelector('[data-action="search"]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  if (target.dataset.action === "cart-input") {
    setCartQty(target.dataset.id, Number(target.value || 1));
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.matches('input[type="color"]')) {
    const preview = { ...state.settings, [target.name]: target.value };
    applyBranding(preview);
  }
}

async function submitLogin(form) {
  const username = form.username.value.trim();
  const password = form.password.value;
  const user = await store.login(username, password);
  state.view = user.role === "client" ? "client" : "admin";
  render();
  toast("Login realizado", `Bem-vindo, ${user.name || user.username}.`, "success");
}

async function submitRegister(form) {
  if (form.password.value.length < 8) {
    throw new Error("Use uma senha com pelo menos 8 caracteres.");
  }
  const user = await store.register({
    name: form.name.value.trim(),
    username: form.username.value.trim(),
    email: form.email.value.trim(),
    password: form.password.value
  });
  state.view = "client";
  render();
  toast("Conta criada", `Bem-vindo, ${user.name || user.username}.`, "success");
}

async function submitInitialSetup(form) {
  const password = form.password.value;
  if (password.length < 8) {
    throw new Error("Use uma senha com pelo menos 8 caracteres.");
  }
  if (password !== form.confirmPassword.value) {
    throw new Error("As senhas não conferem.");
  }

  const user = await store.createInitialMaster({
    name: form.name.value.trim(),
    username: form.username.value.trim(),
    email: form.email.value.trim(),
    password
  });
  state.view = "admin";
  render();
  toast("Administrador criado", `Bem-vindo, ${user.name || user.username}.`, "success");
}

async function submitPasswordChange(form) {
  const newPassword = form.newPassword.value;
  if (newPassword.length < 8) {
    throw new Error("Use uma senha com pelo menos 8 caracteres.");
  }
  if (newPassword !== form.confirmPassword.value) {
    throw new Error("As senhas não conferem.");
  }
  await store.changeOwnPassword(form.currentPassword.value, newPassword);
  toast("Senha alterada", "Você já pode continuar usando o sistema.", "success");
}

async function submitProduct(form) {
  assertPermission("products");
  const file = form.imageFile.files?.[0];
  let imageUrl = normalizeImageUrl(form.imageUrl.value.trim());
  if (file) {
    imageUrl = await store.uploadImage(file, "products");
  }

  await store.saveProduct({
    id: form.id.value || undefined,
    name: form.name.value.trim(),
    description: form.description.value.trim(),
    price: Number(form.price.value || 0),
    stock: Number(form.stock.value || 0),
    imageUrl
  });

  state.productEditId = null;
  state.search = "";
  if (typeof store.refresh === "function") {
    await store.refresh();
  }
  render();
  toast("Produto salvo", `O catalogo online foi atualizado. Total: ${state.products.length} produto(s).`, "success");
}

async function submitUser(form) {
  assertPermission("users");
  const id = form.id.value || undefined;
  if (!id && (!form.password?.value || form.password.value.length < 8)) {
    throw new Error("Informe uma senha inicial com pelo menos 8 caracteres.");
  }
  const role = form.role?.value || userById(id)?.role || "client";
  const permissions = Object.fromEntries(
    PERMISSIONS.map(([key]) => [key, Boolean(form[`perm_${key}`]?.checked)])
  );

  await store.saveUser({
    id,
    name: form.name.value.trim(),
    username: form.username.value.trim(),
    email: form.email.value.trim(),
    password: form.password?.value,
    role,
    permissions
  });

  state.userEditId = null;
  render();
  toast("Usuário salvo", "As permissões foram atualizadas.", "success");
}

async function submitSettings(form) {
  assertPermission("settings");
  let logoUrl = form.logoUrl.value.trim();
  let coverUrl = form.coverUrl.value.trim();

  if (form.logoFile.files?.[0]) {
    logoUrl = await store.uploadImage(form.logoFile.files[0], "branding");
  }
  if (form.coverFile.files?.[0]) {
    coverUrl = await store.uploadImage(form.coverFile.files[0], "branding");
  }

  await store.updateSettings({
    companyName: form.companyName.value.trim(),
    logoUrl,
    coverUrl,
    primaryColor: form.primaryColor.value,
    secondaryColor: form.secondaryColor.value,
    accentColor: form.accentColor.value
  });

  toast("Identidade salva", "As cores e imagens foram aplicadas.", "success");
}

async function submitContact(form) {
  assertPermission("settings");
  await store.updateSettings({
    contact: {
      phone: form.phone.value.trim(),
      whatsapp: form.whatsapp.value.trim(),
      email: form.email.value.trim(),
      address: form.address.value.trim(),
      site: form.site.value.trim()
    },
    socials: {
      instagram: form.instagram.value.trim(),
      facebook: form.facebook.value.trim(),
      tiktok: form.tiktok.value.trim(),
      youtube: form.youtube.value.trim(),
      linkedin: form.linkedin.value.trim(),
      other: form.other.value.trim(),
      otherLabel: form.otherLabel.value.trim() || "Contato"
    }
  });
  toast("Contato salvo", "Rodapé e links foram atualizados.", "success");
}

function submitReportFilter(form) {
  state.reportMonth = form.month.value || currentMonth();
  state.reportClientId = form.clientId.value || "all";
  render();
}

function addToCart(productId) {
  if (!state.currentUser) {
    state.view = "auth";
    state.authMode = "login";
    render();
    return;
  }
  const product = productById(productId);
  if (!product || Number(product.stock || 0) <= 0) {
    toast("Estoque indisponível", "Este produto não tem unidades disponíveis.", "error");
    return;
  }
  setCartQty(productId, Number(state.cart[productId] || 0) + 1);
  toast("Produto adicionado", product.name, "success");
}

function changeCartQty(productId, delta) {
  setCartQty(productId, Number(state.cart[productId] || 0) + delta);
}

function setCartQty(productId, qty) {
  const product = productById(productId);
  if (!product) return;
  const max = Number(product.stock || 0);
  const nextQty = Math.max(0, Math.min(max, Math.floor(Number(qty || 0))));
  if (nextQty <= 0) {
    delete state.cart[productId];
  } else {
    state.cart[productId] = nextQty;
  }
  render();
}

async function checkout() {
  if (!state.currentUser) {
    state.view = "auth";
    state.authMode = "login";
    render();
    return;
  }
  const items = cartItems();
  if (!items.length) {
    toast("Pedido vazio", "Adicione ao menos um produto.", "error");
    return;
  }

  await store.placeOrder(
    items.map(({ product, qty }) => ({ productId: product.id, qty })),
    state.currentUser.id
  );
  state.cart = {};
  state.view = "client";
  render();
  toast("Pedido confirmado", "O estoque foi atualizado automaticamente.", "success");
}

async function deleteProduct(id) {
  assertPermission("products");
  if (!confirm("Excluir este produto?")) return;
  await store.deleteProduct(id);
  toast("Produto excluído", "O item saiu do catálogo.", "success");
}

async function deleteUser(id) {
  assertPermission("users");
  if (!confirm("Excluir este usuário?")) return;
  await store.deleteUser(id);
  toast("Usuário excluído", "A conta foi removida.", "success");
}

async function resetPassword(id) {
  assertPermission("users");
  const password = prompt("Nova senha temporária:");
  if (!password) return;
  if (password.length < 8) {
    toast("Senha fraca", "Use pelo menos 8 caracteres.", "error");
    return;
  }
  await store.resetPassword(id, password);
  toast("Senha redefinida", "O usuário deverá trocar a senha no próximo acesso.", "success");
}

async function markPaid(id) {
  assertPermission("orders");
  const order = orderById(id);
  if (!order) return;
  await store.updateOrder(id, {
    status: "paid",
    amountPaid: Number(order.total || 0),
    paidAt: new Date().toISOString()
  });
  toast("Pagamento registrado", "O saldo do cliente foi atualizado.", "success");
}

async function cancelOrder(id) {
  assertPermission("orders");
  if (!confirm("Cancelar este pedido e devolver o estoque?")) return;
  await store.cancelOrder(id);
  toast("Pedido cancelado", "As unidades foram devolvidas ao estoque.", "success");
}

async function generateReport(clientId = "all", month = currentMonth()) {
  assertPermissionForReport(clientId);

  if (!window.jspdf?.jsPDF) {
    toast("PDF indisponível", "A biblioteca jsPDF não carregou.", "error");
    return;
  }

  const doc = new window.jspdf.jsPDF();
  const settings = state.settings;
  const clients =
    clientId === "all"
      ? state.users.filter((user) => user.role === "client")
      : [userById(clientId)].filter(Boolean);

  if (!clients.length) {
    toast("Sem cliente", "Nenhum cliente encontrado para o relatório.", "error");
    return;
  }

  clients.forEach((client, index) => {
    if (index > 0) doc.addPage();
    const orders = ordersInMonth(month).filter((order) => order.clientId === client.id);
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const debt = orders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.amountPaid || 0)), 0);
    const primary = hexToRgb(settings.primaryColor || DEFAULT_SETTINGS.primaryColor);

    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.setFontSize(18);
    doc.text(settings.companyName || "Relatório", 14, 18);

    doc.setTextColor(23, 33, 31);
    doc.setFontSize(13);
    doc.text(`Relatório financeiro do cliente`, 14, 30);
    doc.setFontSize(10);
    doc.text(`Cliente: ${client.name || client.username}`, 14, 40);
    doc.text(`Período: ${monthLabel(month)}`, 14, 47);
    doc.text(`Data de emissão: ${dateShort(new Date().toISOString())}`, 14, 54);
    doc.text(`Valor total das compras: ${money(total)}`, 14, 64);
    doc.text(`Valor total a pagar: ${money(debt)}`, 14, 71);

    let y = 84;
    doc.setFontSize(11);
    doc.text("Histórico de compras", 14, y);
    y += 8;
    doc.setFontSize(9);

    if (!orders.length) {
      doc.text("Nenhuma compra registrada no período.", 14, y);
    } else {
      orders.forEach((order) => {
        if (y > 270) {
          doc.addPage();
          y = 18;
        }
        doc.setTextColor(23, 33, 31);
        doc.text(`#${order.number || order.id.slice(0, 8)} - ${dateShort(order.createdAt)} - ${money(order.total)} - ${statusText(order)}`, 14, y);
        y += 6;
        doc.setTextColor(97, 112, 108);
        order.items.forEach((item) => {
          const line = `${item.qty}x ${item.name} (${money(item.price)})`;
          doc.text(line.slice(0, 90), 18, y);
          y += 5;
        });
        y += 3;
      });
    }

    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.setFontSize(9);
    doc.text("Desenvolvido por Talis Souza © 2026", 14, 286);
  });

  const clientPart = clientId === "all" ? "todos-clientes" : slugify(clients[0].name || clients[0].username);
  doc.save(`relatorio-${clientPart}-${month}.pdf`);
  toast("PDF gerado", "O relatório foi baixado no navegador.", "success");
}

function assertPermission(permission) {
  if (!can(permission)) throw new Error("Você não tem permissão para esta ação.");
}

function assertPermissionForReport(clientId) {
  if (can("reports") || can("finance")) return;
  if (state.currentUser?.id && clientId === state.currentUser.id) return;
  throw new Error("Você não tem permissão para gerar este relatório.");
}

function canAccessAdmin() {
  return state.currentUser?.role === "master" || state.currentUser?.role === "admin";
}

function can(permission) {
  const user = state.currentUser;
  if (!user) return false;
  if (user.role === "master") return true;
  if (user.role !== "admin") return false;
  return Boolean(user.permissions?.[permission]);
}

function applyBranding(settings = state.settings) {
  const root = document.documentElement;
  const primary = settings.primaryColor || DEFAULT_SETTINGS.primaryColor;
  const secondary = settings.secondaryColor || DEFAULT_SETTINGS.secondaryColor;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-strong", shadeColor(primary, -18));
  root.style.setProperty("--secondary", secondary);
  root.style.setProperty("--secondary-strong", shadeColor(secondary, -22));
  root.style.setProperty("--accent", settings.accentColor || DEFAULT_SETTINGS.accentColor);
  root.style.setProperty("--cover-image", settings.coverUrl ? `url("${resolveAssetUrl(settings.coverUrl)}")` : "none");

  document.title = settings.companyName || "Sistema de Pedidos";
  const brandName = document.getElementById("brandName");
  const brandLogo = document.getElementById("brandLogo");
  const dataMode = document.getElementById("dataMode");
  const footerLinks = document.getElementById("footerLinks");

  if (brandName) brandName.textContent = settings.companyName || "Sistema de Pedidos";
  if (dataMode) {
    dataMode.textContent =
      state.dataMode === "api"
        ? "API online"
        : "Modo local";
  }
  if (brandLogo) {
    brandLogo.innerHTML = settings.logoUrl
      ? `<img src="${escapeAttr(resolveAssetUrl(settings.logoUrl))}" alt="${escapeAttr(settings.companyName || "Logo")}" />`
      : escapeHtml((settings.companyName || "T").charAt(0).toUpperCase());
  }
  if (footerLinks) footerLinks.innerHTML = renderFooterLinks();
}

function renderFooterLinks() {
  const links = [];
  const contact = state.settings.contact || {};
  const socials = state.settings.socials || {};

  if (contact.whatsapp) links.push(["WhatsApp", normalizeWhatsapp(contact.whatsapp), "message-circle"]);
  if (contact.email) links.push(["E-mail", `mailto:${contact.email}`, "mail"]);
  if (contact.site) links.push(["Site", contact.site, "globe"]);
  SOCIALS.forEach(([key, label, icon]) => {
    const url = socials[key];
    if (url) links.push([key === "other" ? socials.otherLabel || label : label, url, icon]);
  });

  if (!links.length) return "";
  return `
    <span class="footer-links">
      ${links
        .map(
          ([label, href, icon]) => `
          <a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">
            <i data-lucide="${icon}"></i>
          </a>
        `
        )
        .join("")}
    </span>
  `;
}

function resolveAssetUrl(url) {
  if (!url) return "";
  return normalizeImageUrl(url);
}

function metric(label, value, hint) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(hint)}</span>
    </div>
  `;
}

function stockBadge(stock) {
  const className = stock <= 0 ? "is-empty" : stock <= 3 ? "is-low" : "";
  const label = stock <= 0 ? "Sem estoque" : `${stock} un.`;
  return `<span class="stock-badge ${className}">${label}</span>`;
}

function statusBadge(order) {
  const status = order.status || "open";
  return `<span class="status-badge is-${status}">${statusText(order)}</span>`;
}

function roleBadge(role) {
  return `<span class="role-badge">${roleLabel(role)}</span>`;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function filteredProducts() {
  const term = state.search.trim().toLowerCase();
  if (!term) return state.products;
  return state.products.filter((product) =>
    [product.name, product.description].join(" ").toLowerCase().includes(term)
  );
}

function normalizeImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  const driveId =
    value.match(/drive\.google\.com\/file\/d\/([^/]+)/i)?.[1] ||
    value.match(/[?&]id=([^&]+)/i)?.[1];

  if (driveId && /drive\.google\.com/i.test(value)) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`;
  }

  return value;
}

function cartItems() {
  return Object.entries(state.cart)
    .map(([productId, qty]) => ({ product: productById(productId), qty: Number(qty || 0) }))
    .filter(({ product, qty }) => product && qty > 0);
}

function cartCount() {
  return cartItems().reduce((sum, item) => sum + item.qty, 0);
}

function cartTotal() {
  return cartItems().reduce((sum, item) => sum + item.qty * Number(item.product.price || 0), 0);
}

function productById(id) {
  return state.products.find((product) => product.id === id);
}

function userById(id) {
  return state.users.find((user) => user.id === id);
}

function orderById(id) {
  return state.orders.find((order) => order.id === id);
}

function ordersForUser(userId) {
  return state.orders.filter((order) => order.clientId === userId && order.status !== "canceled").sort(byDateDesc);
}

function ordersInMonth(month) {
  return state.orders.filter((order) => monthFromDate(order.createdAt) === month && order.status !== "canceled");
}

function totalForUser(userId) {
  return ordersForUser(userId).reduce((sum, order) => sum + Number(order.total || 0), 0);
}

function balanceForUser(userId) {
  return ordersForUser(userId).reduce(
    (sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.amountPaid || 0)),
    0
  );
}

function permissionSummary(user) {
  if (user.role === "master") return "Todas";
  if (user.role === "client") return "Área do cliente";
  const labels = PERMISSIONS.filter(([key]) => user.permissions?.[key]).map(([, label]) => label);
  return labels.length ? labels.join(", ") : "Sem permissões";
}

function byDateDesc(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function roleLabel(role) {
  if (role === "master") return "Master";
  if (role === "admin") return "Administrador";
  return "Cliente";
}

function roleIcon(role) {
  if (role === "master") return "crown";
  if (role === "admin") return "shield-check";
  return "user";
}

function statusText(order) {
  if (order.status === "paid") return "Pago";
  if (order.status === "canceled") return "Cancelado";
  return "Aberto";
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function dateShort(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthFromDate(value) {
  return new Date(value).toISOString().slice(0, 7);
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, monthNumber - 1, 1)
  );
}

function slugify(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeWhatsapp(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : value;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

function toast(title, message = "", type = "info") {
  const zone = document.getElementById("toastZone");
  const item = document.createElement("div");
  item.className = `toast is-${type}`;
  item.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  zone.appendChild(item);
  setTimeout(() => item.remove(), 4400);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function shadeColor(hex, percent) {
  const rgb = hexToRgb(hex);
  const amount = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, rgb.r + amount));
  const g = Math.max(0, Math.min(255, rgb.g + amount));
  const b = Math.max(0, Math.min(255, rgb.b + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
  const normalized = String(hex || "#0f766e").replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const bigint = parseInt(value || "0f766e", 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

async function digestPassword(password, salt) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function uid(prefix = "id") {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...profile } = user;
  return structuredClone(profile);
}

function createApiStore() {
  let listener = null;
  let refreshTimer = null;

  async function request(path, options = {}) {
    const endpoints = [`/api/${path}`, `/.netlify/functions/backend/${path}`];
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          credentials: "include",
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
          }
        });

        const text = await response.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          lastError = new Error("A rota da API retornou HTML em vez de JSON.");
          continue;
        }

        if (!response.ok) {
          lastError = new Error(data.error || "Erro na API online.");
          continue;
        }

        normalizeSnapshot(data);
        return data;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Erro na API online.");
  }

  async function refresh(silent = false) {
    if (silent && isEditingForm()) return;
    const snapshot = await request("state", { method: "GET" });
    if (listener) listener(snapshot);
    return snapshot;
  }

  async function mutate(path, payload = {}) {
    const snapshot = await request(path, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (listener) listener(snapshot);
    return snapshot;
  }

  return {
    async init(onChange) {
      listener = onChange;
      const snapshot = await refresh();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(() => {
        refresh(true).catch((error) => console.warn("Falha ao sincronizar API:", error));
      }, 7000);
      return snapshot;
    },

    async refresh() {
      return await refresh(false);
    },

    async login(username, password) {
      const snapshot = await mutate("login", { username, password });
      return snapshot.currentUser;
    },

    async logout() {
      await mutate("logout");
    },

    async register(payload) {
      const snapshot = await mutate("register", payload);
      return snapshot.currentUser;
    },

    async createInitialMaster(payload) {
      const snapshot = await mutate("setup", payload);
      return snapshot.currentUser;
    },

    async changeOwnPassword(currentPassword, newPassword) {
      await mutate("password", { currentPassword, newPassword });
    },

    async saveProduct(product) {
      return await mutate("products/save", product);
    },

    async deleteProduct(id) {
      await mutate("products/delete", { id });
    },

    async uploadImage(file, folder) {
      const prepared = await prepareImageUpload(file, folder);
      const result = await request("upload", {
        method: "POST",
        body: JSON.stringify({
          folder,
          fileName: prepared.fileName,
          mimeType: prepared.mimeType,
          dataUrl: prepared.dataUrl
        })
      });
      return result.url;
    },

    async saveUser(payload) {
      await mutate("users/save", payload);
    },

    async deleteUser(id) {
      await mutate("users/delete", { id });
    },

    async resetPassword(id, password) {
      await mutate("users/reset-password", { id, password });
    },

    async updateSettings(partial) {
      await mutate("settings", partial);
    },

    async placeOrder(items) {
      await mutate("orders/place", { items });
    },

    async updateOrder(id, updates) {
      await mutate("orders/update", { id, updates });
    },

    async cancelOrder(id) {
      await mutate("orders/cancel", { id });
    }
  };
}

function normalizeSnapshot(snapshot) {
  snapshot.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(snapshot.settings || {}) };
  snapshot.products = Array.isArray(snapshot.products) ? snapshot.products : [];
  snapshot.users = Array.isArray(snapshot.users) ? snapshot.users : [];
  snapshot.orders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
  snapshot.logs = Array.isArray(snapshot.logs) ? snapshot.logs : [];
  snapshot.currentUser = snapshot.currentUser || null;
  snapshot.needsSetup = Boolean(snapshot.needsSetup);
  snapshot.dataMode = snapshot.dataMode || "api";
}

function isEditingForm() {
  const active = document.activeElement;
  return Boolean(active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function prepareImageUpload(file, folder = "products") {
  if (!file) throw new Error("Selecione uma imagem.");
  const mimeType = file.type || "application/octet-stream";
  if (!mimeType.startsWith("image/")) {
    throw new Error("Envie apenas arquivos de imagem.");
  }

  const maxDataUrlLength = 4_500_000;
  const isSmallRaster = file.size <= 900_000 && mimeType !== "image/heic" && mimeType !== "image/heif";
  if (isSmallRaster) {
    const dataUrl = await fileToDataUrl(file);
    if (dataUrl.length <= maxDataUrlLength) {
      return { dataUrl, fileName: file.name || "imagem", mimeType };
    }
  }

  const compressed = await compressImageFile(file, {
    maxSide: folder === "branding" ? 1200 : 1400,
    maxDataUrlLength
  });
  if (compressed) return compressed;

  const dataUrl = await fileToDataUrl(file);
  if (dataUrl.length > maxDataUrlLength) {
    throw new Error("A imagem ficou grande demais. Envie uma imagem menor ou tire a foto em resolucao menor.");
  }
  return { dataUrl, fileName: file.name || "imagem", mimeType };
}

function compressImageFile(file, options = {}) {
  const maxSide = options.maxSide || 1400;
  const maxDataUrlLength = options.maxDataUrlLength || 4_500_000;

  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const originalMax = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
      if (!originalMax) {
        resolve(null);
        return;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      let targetSide = Math.min(maxSide, originalMax);
      let quality = 0.82;
      let best = null;

      for (let attempt = 0; attempt < 7; attempt += 1) {
        const scale = Math.min(1, targetSide / originalMax);
        canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        best = {
          dataUrl,
          fileName: `${String(file.name || "imagem").replace(/\.[^.]+$/, "")}.jpg`,
          mimeType: "image/jpeg"
        };

        if (dataUrl.length <= maxDataUrlLength) {
          resolve(best);
          return;
        }

        targetSide = Math.max(720, Math.round(targetSide * 0.8));
        quality = Math.max(0.58, quality - 0.07);
      }

      resolve(best && best.dataUrl.length <= maxDataUrlLength ? best : null);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    image.src = objectUrl;
  });
}

function createLocalStore() {
  let db = null;
  const listeners = new Set();

  async function ensureDb() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      db = JSON.parse(stored);
      db.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(db.settings || {}) };
      db.products ||= [];
      db.users ||= [];
      db.orders ||= [];
      db.logs ||= [];
      return;
    }

    db = {
      settings: structuredClone(DEFAULT_SETTINGS),
      products: structuredClone(SAMPLE_PRODUCTS),
      orders: [],
      logs: [],
      users: []
    };
    persist();
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  function currentUser() {
    const id = localStorage.getItem(SESSION_KEY);
    return safeUser(db.users.find((user) => user.id === id));
  }

  function snapshot() {
    return {
      settings: structuredClone(db.settings),
      products: structuredClone(db.products).sort((a, b) => a.name.localeCompare(b.name)),
      users: db.users.map(safeUser).sort((a, b) => a.name.localeCompare(b.name)),
      orders: structuredClone(db.orders),
      logs: structuredClone(db.logs),
      currentUser: currentUser(),
      dataMode: "demo",
      needsSetup: !db.users.some((user) => user.role === "master")
    };
  }

  function notify() {
    persist();
    const data = snapshot();
    listeners.forEach((listener) => listener(data));
  }

  function log(action, message) {
    db.logs.push({
      id: uid("log"),
      action,
      message,
      createdAt: new Date().toISOString()
    });
  }

  async function hashFor(password) {
    const salt = uid("salt");
    return {
      passwordSalt: salt,
      passwordHash: await digestPassword(password, salt)
    };
  }

  function findUserByLogin(login) {
    const normalized = login.toLowerCase();
    return db.users.find(
      (user) => user.usernameLower === normalized || String(user.email || "").toLowerCase() === normalized
    );
  }

  return {
    async init(onChange) {
      await ensureDb();
      listeners.add(onChange);
      onChange(snapshot());
    },

    async login(login, password) {
      const user = findUserByLogin(login);
      if (!user) throw new Error("Usuário não encontrado.");
      const hash = await digestPassword(password, user.passwordSalt);
      if (hash !== user.passwordHash) throw new Error("Senha inválida.");
      user.lastLogin = new Date().toISOString();
      localStorage.setItem(SESSION_KEY, user.id);
      log("Login", `${user.username} acessou o sistema.`);
      notify();
      return safeUser(user);
    },

    async logout() {
      localStorage.removeItem(SESSION_KEY);
      notify();
    },

    async register(payload) {
      if (!db.users.some((user) => user.role === "master")) {
        throw new Error("Crie o Administrador Master antes de cadastrar clientes.");
      }
      if (findUserByLogin(payload.username) || findUserByLogin(payload.email)) {
        throw new Error("Usuário ou e-mail já cadastrado.");
      }
      const now = new Date().toISOString();
      const passwordData = await hashFor(payload.password);
      const user = {
        id: uid("user"),
        username: payload.username,
        usernameLower: payload.username.toLowerCase(),
        name: payload.name,
        email: payload.email,
        role: "client",
        permissions: {},
        mustChangePassword: false,
        createdAt: now,
        lastLogin: now,
        ...passwordData
      };
      db.users.push(user);
      localStorage.setItem(SESSION_KEY, user.id);
      log("Cadastro", `${user.username} criou uma conta de cliente.`);
      notify();
      return safeUser(user);
    },

    async createInitialMaster(payload) {
      if (db.users.some((user) => user.role === "master")) {
        throw new Error("O Administrador Master inicial já foi criado.");
      }
      if (findUserByLogin(payload.username) || findUserByLogin(payload.email)) {
        throw new Error("Usuário ou e-mail já cadastrado.");
      }
      const now = new Date().toISOString();
      const passwordData = await hashFor(payload.password);
      const user = {
        id: uid("master"),
        username: payload.username,
        usernameLower: payload.username.toLowerCase(),
        name: payload.name,
        email: payload.email,
        role: "master",
        permissions: Object.fromEntries(PERMISSIONS.map(([key]) => [key, true])),
        mustChangePassword: false,
        createdAt: now,
        lastLogin: now,
        ...passwordData
      };
      db.users.push(user);
      localStorage.setItem(SESSION_KEY, user.id);
      log("Configuração inicial", `${user.username} criou o Administrador Master.`);
      notify();
      return safeUser(user);
    },

    async changeOwnPassword(currentPassword, newPassword) {
      const id = localStorage.getItem(SESSION_KEY);
      const user = db.users.find((item) => item.id === id);
      if (!user) throw new Error("Sessão expirada.");
      const currentHash = await digestPassword(currentPassword, user.passwordSalt);
      if (currentHash !== user.passwordHash) throw new Error("Senha atual inválida.");
      Object.assign(user, await hashFor(newPassword), { mustChangePassword: false });
      log("Senha alterada", `${user.username} alterou a própria senha.`);
      notify();
    },

    async saveProduct(product) {
      const now = new Date().toISOString();
      if (product.id) {
        const index = db.products.findIndex((item) => item.id === product.id);
        if (index < 0) throw new Error("Produto não encontrado.");
        db.products[index] = { ...db.products[index], ...product, updatedAt: now };
        log("Produto editado", product.name);
      } else {
        db.products.push({ ...product, id: uid("prod"), createdAt: now, updatedAt: now });
        log("Produto criado", product.name);
      }
      notify();
    },

    async deleteProduct(id) {
      db.products = db.products.filter((product) => product.id !== id);
      log("Produto excluído", id);
      notify();
    },

    async uploadImage(file) {
      const prepared = await prepareImageUpload(file);
      return prepared.dataUrl;
    },

    async saveUser(payload) {
      const now = new Date().toISOString();
      if (payload.id) {
        const index = db.users.findIndex((user) => user.id === payload.id);
        if (index < 0) throw new Error("Usuário não encontrado.");
        const current = db.users[index];
        if (current.role === "master" && payload.role !== "master") {
          throw new Error("O Master principal não pode ser rebaixado.");
        }
        db.users[index] = {
          ...current,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          permissions: payload.role === "master" ? Object.fromEntries(PERMISSIONS.map(([key]) => [key, true])) : payload.permissions,
          updatedAt: now
        };
        log("Usuário editado", payload.username);
      } else {
        if (findUserByLogin(payload.username) || findUserByLogin(payload.email)) {
          throw new Error("Usuário ou e-mail já cadastrado.");
        }
        db.users.push({
          id: uid("user"),
          username: payload.username,
          usernameLower: payload.username.toLowerCase(),
          name: payload.name,
          email: payload.email,
          role: payload.role,
          permissions: payload.role === "master" ? Object.fromEntries(PERMISSIONS.map(([key]) => [key, true])) : payload.permissions,
          mustChangePassword: true,
          createdAt: now,
          lastLogin: "",
          ...(await hashFor(payload.password))
        });
        log("Usuário criado", payload.username);
      }
      notify();
    },

    async deleteUser(id) {
      const user = db.users.find((item) => item.id === id);
      if (!user) return;
      if (user.role === "master") throw new Error("O Master não pode ser excluído.");
      db.users = db.users.filter((item) => item.id !== id);
      log("Usuário excluído", user.username);
      notify();
    },

    async resetPassword(id, password) {
      const user = db.users.find((item) => item.id === id);
      if (!user) throw new Error("Usuário não encontrado.");
      Object.assign(user, await hashFor(password), { mustChangePassword: true });
      log("Senha redefinida", user.username);
      notify();
    },

    async updateSettings(partial) {
      db.settings = {
        ...db.settings,
        ...partial,
        contact: { ...(db.settings.contact || {}), ...(partial.contact || {}) },
        socials: { ...(db.settings.socials || {}), ...(partial.socials || {}) }
      };
      log("Configurações", "Identidade visual ou contato atualizado.");
      notify();
    },

    async placeOrder(items, clientId) {
      const client = db.users.find((user) => user.id === clientId);
      if (!client) throw new Error("Cliente não encontrado.");
      const orderItems = items.map(({ productId, qty }) => {
        const product = db.products.find((item) => item.id === productId);
        if (!product) throw new Error("Produto não encontrado.");
        if (Number(product.stock || 0) < qty) throw new Error(`Estoque insuficiente para ${product.name}.`);
        return {
          productId,
          name: product.name,
          qty,
          price: Number(product.price || 0),
          subtotal: qty * Number(product.price || 0)
        };
      });

      orderItems.forEach((item) => {
        const product = db.products.find((entry) => entry.id === item.productId);
        product.stock = Number(product.stock || 0) - item.qty;
        product.updatedAt = new Date().toISOString();
      });

      const order = {
        id: uid("order"),
        number: String(db.orders.length + 1).padStart(5, "0"),
        clientId,
        clientName: client.name || client.username,
        items: orderItems,
        total: orderItems.reduce((sum, item) => sum + item.subtotal, 0),
        amountPaid: 0,
        status: "open",
        createdAt: new Date().toISOString()
      };
      db.orders.push(order);
      log("Pedido criado", `${client.username} fez o pedido #${order.number}.`);
      notify();
    },

    async updateOrder(id, updates) {
      const index = db.orders.findIndex((order) => order.id === id);
      if (index < 0) throw new Error("Pedido não encontrado.");
      db.orders[index] = { ...db.orders[index], ...updates, updatedAt: new Date().toISOString() };
      log("Pedido atualizado", id);
      notify();
    },

    async cancelOrder(id) {
      const order = db.orders.find((item) => item.id === id);
      if (!order) throw new Error("Pedido não encontrado.");
      if (order.status === "canceled") return;
      order.items.forEach((item) => {
        const product = db.products.find((entry) => entry.id === item.productId);
        if (product) product.stock = Number(product.stock || 0) + Number(item.qty || 0);
      });
      order.status = "canceled";
      order.updatedAt = new Date().toISOString();
      log("Pedido cancelado", id);
      notify();
    }
  };
}

async function createFirebaseStore(config) {
  const appModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const authModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const storageModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");

  const {
    initializeApp,
    deleteApp
  } = appModule;
  const {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    createUserWithEmailAndPassword,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential
  } = authModule;
  const {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    limit,
    runTransaction,
    serverTimestamp,
    orderBy
  } = firestoreModule;
  const {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
  } = storageModule;

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const listeners = new Set();
  const unsubscribers = [];
  const data = {
    settings: structuredClone(DEFAULT_SETTINGS),
    products: [],
    users: [],
    orders: [],
    logs: [],
    currentUser: null,
    needsSetup: false,
    dataMode: "firebase"
  };

  function emit() {
    const snapshot = structuredClone(data);
    listeners.forEach((listener) => listener(snapshot));
  }

  function attachPublicListeners() {
    unsubscribers.push(
      onSnapshot(doc(db, "settings", "global"), (snap) => {
        data.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(snap.exists() ? snap.data() : {}) };
        emit();
      })
    );

    unsubscribers.push(
      onSnapshot(collection(db, "products"), (snap) => {
        data.products = snap.docs.map((entry) => normalizeDoc(entry)).sort((a, b) => a.name.localeCompare(b.name));
        emit();
      })
    );
  }

  function attachProtectedListeners() {
    unsubscribers.splice(2).forEach((unsubscribe) => unsubscribe());
    if (!data.currentUser) {
      data.users = [];
      data.orders = [];
      data.logs = [];
      emit();
      return;
    }

    if (data.currentUser.role === "master" || data.currentUser.role === "admin") {
      unsubscribers.push(
        onSnapshot(collection(db, "users"), (snap) => {
          data.users = snap.docs.map((entry) => normalizeDoc(entry)).sort((a, b) => a.name.localeCompare(b.name));
          emit();
        })
      );
      unsubscribers.push(
        onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
          data.orders = snap.docs.map(normalizeDoc);
          emit();
        })
      );
      if (data.currentUser.role === "master") {
        unsubscribers.push(
          onSnapshot(query(collection(db, "logs"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
            data.logs = snap.docs.map(normalizeDoc);
            emit();
          })
        );
      }
    } else {
      data.users = [data.currentUser];
      unsubscribers.push(
        onSnapshot(query(collection(db, "orders"), where("clientId", "==", data.currentUser.id)), (snap) => {
          data.orders = snap.docs.map(normalizeDoc);
          emit();
        })
      );
    }
  }

  async function log(action, message) {
    if (!auth.currentUser) return;
    await addDoc(collection(db, "logs"), {
      action,
      message,
      userId: auth.currentUser.uid,
      createdAt: serverTimestamp()
    }).catch(() => {});
  }

  async function profileForUser(user) {
    if (!user) return null;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return null;
    return normalizeDoc(snap);
  }

  return {
    async init(onChange) {
      listeners.add(onChange);
      attachPublicListeners();
      onAuthStateChanged(auth, async (firebaseUser) => {
        data.currentUser = await profileForUser(firebaseUser);
        if (data.currentUser && firebaseUser.metadata?.lastSignInTime) {
          updateDoc(doc(db, "users", firebaseUser.uid), {
            lastLogin: new Date(firebaseUser.metadata.lastSignInTime).toISOString()
          }).catch(() => {});
        }
        attachProtectedListeners();
        emit();
      });
      emit();
    },

    async login(login, password) {
      let email = login;
      if (!login.includes("@")) {
        const snap = await getDocs(query(collection(db, "users"), where("usernameLower", "==", login.toLowerCase()), limit(1)));
        if (snap.empty) throw new Error("Usuário não encontrado.");
        email = snap.docs[0].data().email;
      }
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const profile = await profileForUser(credential.user);
      if (!profile) throw new Error("Perfil de usuário não encontrado no Firestore.");
      data.currentUser = profile;
      await log("Login", `${profile.username} acessou o sistema.`);
      emit();
      return profile;
    },

    async logout() {
      await signOut(auth);
      data.currentUser = null;
      emit();
    },

    async register(payload) {
      const credential = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
      const profile = {
        id: credential.user.uid,
        username: payload.username,
        usernameLower: payload.username.toLowerCase(),
        name: payload.name,
        email: payload.email,
        role: "client",
        permissions: {},
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, "users", credential.user.uid), profile);
      data.currentUser = profile;
      await log("Cadastro", `${profile.username} criou uma conta.`);
      emit();
      return profile;
    },

    async changeOwnPassword(currentPassword, newPassword) {
      if (!auth.currentUser) throw new Error("Sessão expirada.");
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      await updateDoc(doc(db, "users", auth.currentUser.uid), { mustChangePassword: false });
      await log("Senha alterada", "Usuário alterou a própria senha.");
    },

    async saveProduct(product) {
      const payload = {
        name: product.name,
        description: product.description,
        price: Number(product.price || 0),
        stock: Number(product.stock || 0),
        imageUrl: product.imageUrl || "",
        updatedAt: new Date().toISOString()
      };
      if (product.id) {
        await updateDoc(doc(db, "products", product.id), payload);
      } else {
        await addDoc(collection(db, "products"), { ...payload, createdAt: new Date().toISOString() });
      }
      await log("Produto salvo", product.name);
    },

    async deleteProduct(id) {
      await deleteDoc(doc(db, "products", id));
      await log("Produto excluído", id);
    },

    async uploadImage(file, folder) {
      const safeName = `${folder}/${Date.now()}-${slugify(file.name)}`;
      const storageRef = ref(storage, safeName);
      await uploadBytes(storageRef, file);
      return getDownloadURL(storageRef);
    },

    async saveUser(payload) {
      const permissions = payload.role === "master"
        ? Object.fromEntries(PERMISSIONS.map(([key]) => [key, true]))
        : payload.permissions;

      if (payload.id) {
        await updateDoc(doc(db, "users", payload.id), {
          name: payload.name,
          email: payload.email,
          role: payload.role,
          permissions,
          updatedAt: new Date().toISOString()
        });
        await log("Usuário editado", payload.username);
        return;
      }

      const secondary = initializeApp(config, `secondary-${Date.now()}`);
      const secondaryAuth = getAuth(secondary);
      if (!payload.password || payload.password.length < 8) {
        throw new Error("Informe uma senha inicial com pelo menos 8 caracteres.");
      }
      const credential = await createUserWithEmailAndPassword(secondaryAuth, payload.email, payload.password);
      await setDoc(doc(db, "users", credential.user.uid), {
        id: credential.user.uid,
        username: payload.username,
        usernameLower: payload.username.toLowerCase(),
        name: payload.name,
        email: payload.email,
        role: payload.role,
        permissions,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
        lastLogin: ""
      });
      await signOut(secondaryAuth);
      await deleteApp(secondary);
      await log("Usuário criado", payload.username);
    },

    async deleteUser(id) {
      await deleteDoc(doc(db, "users", id));
      await log("Usuário excluído", id);
    },

    async resetPassword() {
      throw new Error("No Firebase, redefina senhas pelo Firebase Authentication ou por uma Function administrativa.");
    },

    async updateSettings(partial) {
      await setDoc(
        doc(db, "settings", "global"),
        {
          ...partial,
          contact: { ...(data.settings.contact || {}), ...(partial.contact || {}) },
          socials: { ...(data.settings.socials || {}), ...(partial.socials || {}) },
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      await log("Configurações", "Identidade visual ou contato atualizado.");
    },

    async placeOrder(items, clientId) {
      await runTransaction(db, async (transaction) => {
        const productRefs = items.map((item) => doc(db, "products", item.productId));
        const productSnaps = [];
        for (const productRef of productRefs) {
          productSnaps.push(await transaction.get(productRef));
        }

        const orderItems = items.map((item, index) => {
          const snap = productSnaps[index];
          if (!snap.exists()) throw new Error("Produto não encontrado.");
          const product = snap.data();
          if (Number(product.stock || 0) < item.qty) throw new Error(`Estoque insuficiente para ${product.name}.`);
          return {
            productId: snap.id,
            name: product.name,
            qty: item.qty,
            price: Number(product.price || 0),
            subtotal: item.qty * Number(product.price || 0)
          };
        });

        productRefs.forEach((productRef, index) => {
          const currentStock = Number(productSnaps[index].data().stock || 0);
          transaction.update(productRef, {
            stock: currentStock - Number(items[index].qty || 0),
            updatedAt: new Date().toISOString()
          });
        });

        const orderRef = doc(collection(db, "orders"));
        transaction.set(orderRef, {
          id: orderRef.id,
          number: String(Date.now()).slice(-6),
          clientId,
          clientName: data.currentUser?.name || data.currentUser?.username || "Cliente",
          items: orderItems,
          total: orderItems.reduce((sum, item) => sum + item.subtotal, 0),
          amountPaid: 0,
          status: "open",
          createdAt: new Date().toISOString()
        });
      });
      await log("Pedido criado", `${data.currentUser?.username || "Cliente"} fez um pedido.`);
    },

    async updateOrder(id, updates) {
      await updateDoc(doc(db, "orders", id), { ...updates, updatedAt: new Date().toISOString() });
      await log("Pedido atualizado", id);
    },

    async cancelOrder(id) {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Pedido não encontrado.");
        const order = orderSnap.data();
        if (order.status === "canceled") return;
        for (const item of order.items || []) {
          const productRef = doc(db, "products", item.productId);
          const productSnap = await transaction.get(productRef);
          if (productSnap.exists()) {
            transaction.update(productRef, {
              stock: Number(productSnap.data().stock || 0) + Number(item.qty || 0),
              updatedAt: new Date().toISOString()
            });
          }
        }
        transaction.update(orderRef, { status: "canceled", updatedAt: new Date().toISOString() });
      });
      await log("Pedido cancelado", id);
    }
  };
}

function normalizeDoc(entry) {
  const data = entry.data();
  return {
    id: data.id || entry.id,
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value && typeof value.toDate === "function" ? value.toDate().toISOString() : value
      ])
    )
  };
}
