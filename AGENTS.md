# Pluzo Sites Cache Extension

## Objetivo

- Projeto: extensao Chrome para diagnosticar como sites publicos Pluzo carregam paginas e chamadas de filtro.
- Resultado esperado: ao abrir um site como `https://pluzo.top/`, a extensao deve listar requests relevantes e indicar se vieram do cache do browser, cache Cloudflare, cache interno do Worker SSR ou se acionaram D1/tenant REST.
- Usuarios-alvo: Fernando, devs Pluzo e suporte tecnico.

<!-- DOC-GUARD: Este projeto existe para diagnosticar cache dos sites publicos Pluzo via headers/Network; nao transformar em ferramenta generica sem pedido explicito de Fernando. -->

## Escopo Inicial

- Chrome Extension Manifest V3.
- Diagnostico para hosts Pluzo de sites publicos, incluindo dominios proprios como `pluzo.top`, `pluzo.shop` e futuros dominios de clientes.
- Capturar paginas HTML, JSON de filtros (`/api/filtros`, `/api/filtro-opcoes`, `/api/bairros`) e assets publicos quando relevante.
- Interpretar headers Pluzo/Cloudflare: `cache-control`, `cf-cache-status`, `age`, `x-cache`, `x-cache-ttl`, `x-pluzo-ssr-diag`, `server-timing`.
- Inferir cache do browser quando a chamada nao chega ao servidor usando dados da aba Network/Performance quando disponiveis.

## Fora Do Escopo Inicial

- Nao alterar cache, purge, D1, Cloudflare, Worker ou dados de clientes.
- Nao exigir login no Pluzo.
- Nao capturar corpo de resposta por padrao.
- Nao enviar dados para servidor externo.
- Nao guardar tokens, cookies, headers sensiveis ou dados pessoais.

## Diretrizes

- Privacidade primeiro: processar tudo localmente no navegador.
- Minimo de permissoes no `manifest.json`.
- Preferir `chrome.devtools.network` para relatorio completo quando DevTools estiver aberto.
- Usar `chrome.webRequest`/content script apenas quando necessario e com filtros de host restritos.
- Nunca modificar headers ou bloquear requests; a extensao e somente leitura.
- Relatorio deve ser simples: request, origem provavel, evidencias e alertas.
- Tratar ausencia de dados como `indeterminado`, nao inventar diagnostico.

## Regras De Diagnostico

- `cf-cache-status: HIT` indica cache Cloudflare.
- `x-cache: HIT` indica cache interno do Worker SSR (`caches.default`).
- `x-pluzo-ssr-diag` com `tenantRestCount=0` indica que nao houve fallback tenant REST.
- `x-pluzo-ssr-diag` com `subrequests=cache:1` indica leitura de cache interno sem D1 master.
- `x-pluzo-ssr-diag` com `masterD1:N` indica consulta ao master D1 para metadata/read-model.
- `x-pluzo-ssr-diag` com `tenantRestCount>0` indica caminho lento/fallback tenant REST.
- `cache-control` esperado para rotas publicas cacheaveis: `max-age=60` e `s-maxage=2592000`.
- Se a chamada veio 100% do browser cache, Cloudflare/Worker/D1 nao foram chamados naquela navegacao.

## Validacao Esperada

- Testar manualmente com `https://pluzo.top/` e `https://pluzo.shop/`.
- Verificar uma pagina inicial e uma chamada `/api/filtro-opcoes`.
- Confirmar que `max-age=60` aparece no relatorio quando houver resposta de rede/cache Cloudflare.
- Confirmar que `tenantRestCount=0` aparece como OK quando presente.

## Cuidados

- DevTools aberto apos a pagina carregar pode perder requests antigos; orientar reload.
- Browser cache pode nao gerar request observavel; marcar como cache local quando inferivel.
- Alguns campos HAR podem variar por versao do Chrome; manter fallback por headers.
- Nao commitar `dist/`, `node_modules/`, builds empacotados ou arquivos com dados de navegacao.

## Workflow De Build

<!-- DOC-GUARD: Regra oficial em docs/build.md: toda alteracao da extensao deve deixar `dist/` atualizado. Alterar somente com pedido/autorizacao explicita de Fernando. -->

- Sempre que alterar a extensao, rodar `npm run build` antes de concluir para manter `dist/` atualizado no workspace local.
- Continuar sem commitar `dist/` salvo pedido explicito.
