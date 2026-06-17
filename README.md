# Sistema de Pedidos Online

Sistema online de pedidos para pequena empresa, com frontend estático e backend serverless na Netlify.

## Como funciona

- O frontend fica em `index.html`, `styles.css` e `app.js`.
- A API online fica em `netlify/functions/api.mjs`.
- Os dados persistentes ficam no Netlify Blobs:
  - usuários;
  - produtos;
  - pedidos;
  - estoque;
  - configurações da empresa;
  - logs;
  - imagens enviadas.
- A autenticação usa senha com hash no backend e sessão por cookie `HttpOnly`.
- Não existe usuário ou senha padrão.
- No primeiro acesso publicado na Netlify, o sistema abre a tela para criar o Administrador Master.

## Publicar na Netlify

1. Envie todos os arquivos desta pasta para um repositório Git.
2. Crie um site na Netlify apontando para o repositório.
3. A Netlify instalará a dependência `@netlify/blobs` a partir do `package.json`.
4. Publique o site.
5. Acesse a URL publicada e crie o Administrador Master na primeira tela.

Não é necessário criar Firebase, Supabase ou configurar chaves de API.

## Recursos incluídos

- Catálogo público de produtos.
- Cadastro e login de clientes.
- Área do cliente com reservas/pedidos, histórico e valores a pagar.
- Área administrativa com valores a receber no mês, clientes, pedidos, usuários e permissões.
- Upload de imagens pelo backend.
- Controle de estoque persistente online.
- Relatórios em PDF no navegador.
- Personalização de nome, logo, capa, cores, contato e redes sociais.
- Layout responsivo para celular, tablet e computador.

## Teste local

Abrir o `index.html` diretamente ou usar um servidor estático comum não executa as Netlify Functions. Nesse caso o sistema cai em modo local.

Para testar o backend online antes da produção, use a própria Netlify com um deploy de preview ou rode com Netlify Dev.
