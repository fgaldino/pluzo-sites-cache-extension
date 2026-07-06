# Lista de tarefas - Pluzo Sites Cache Extension

## Contexto para execucao

<!-- DOC-GUARD: Requisitos oficiais em docs/requisitos.md: monitoramento continuo, dominios configuraveis e janela destacada movivel para outro monitor. Alterar somente com pedido/autorizacao explicita de Fernando. -->

- Objetivo: criar uma extensao Chrome que registre continuamente as requisicoes enquanto Fernando navega em sites monitorados e informe se cada dado veio do browser cache, Cloudflare cache, Worker SSR cache, D1 master, tenant REST ou ficou indeterminado.
- Escopo: Manifest V3, configuracao local de dominios monitorados, captura de headers/Network, janela destacada movivel para o lado ou outro monitor, painel/relatorio local, interpretacao de headers Pluzo/Cloudflare e validacao manual em `pluzo.top` e `pluzo.shop`.
- Decisoes/premissas: a extensao e somente leitura; nao faz purge; nao altera headers; nao envia dados para backend; monitora apenas dominios configurados/autorizados; usa headers existentes do Pluzo (`x-cache`, `x-pluzo-ssr-diag`, `server-timing`) e Cloudflare (`cf-cache-status`, `age`, `cache-control`).
- Decisao de UI: o popup persistente deve ser uma janela destacada da extensao via `chrome.windows`, porque o popup nativo da toolbar fecha ao perder foco; overlay injetado nao e obrigatorio nesta fase.
- Areas/arquivos provaveis: `manifest.json`, `src/background.ts`, `src/content.ts`, `src/options.html`, `src/options.ts`, `src/dashboard.html`, `src/dashboard.ts`, `src/diagnostics.ts`, `src/storage.ts`, `src/panel.html`, `src/panel.ts`, `src/devtools.html`, `src/devtools.ts`, `src/styles.css`, `README.md`, `docs/`.
- Validacao esperada: carregar extensao em modo desenvolvedor; configurar `pluzo.top`; abrir janela destacada; navegar no site; confirmar HTML e `/api/filtro-opcoes`; mover janela para o lado/outro monitor; repetir em `pluzo.shop`; confirmar diagnosticos de cache/D1/tenant REST quando headers existirem.
- Cuidados: manter permissoes minimas; pedir permissao de host para dominios configurados quando viavel; nao capturar cookies/tokens; nao enviar dados para fora do navegador; marcar diagnostico como `indeterminado` quando nao houver evidencia suficiente; lembrar que browser cache pode nao gerar request de rede.

- [ ] 1. Definir arquitetura da extensao
    - Passos: escolher Manifest V3; definir background service worker como coletor continuo; definir janela destacada como dashboard principal; definir content script apenas para Performance API quando necessario; definir tela de opcoes para dominios; manter painel DevTools como visualizacao complementar; definir fluxo `webRequest/Performance API -> diagnostico -> storage local -> janela/painel`.
    - Arquivos/area: `docs/requisitos.md`, `README.md`, `manifest.json`, `src/`.
    - Pronto quando: arquitetura registra que a extensao monitora durante a navegacao normal e nao depende exclusivamente do DevTools aberto.

- [ ] 2. Criar estrutura inicial do projeto
    - Passos: criar `package.json`; escolher stack simples TypeScript + Vite ou build equivalente; criar `src/`; criar `manifest.json`; adicionar `.gitignore`; adicionar comandos `dev`, `build`, `typecheck` se houver TypeScript.
    - Arquivos/area: raiz do projeto, `src/`, configs de build.
    - Pronto quando: extensao builda sem codigo funcional complexo e pode ser carregada no Chrome.

- [ ] 3. Implementar configuracao de dominios monitorados
    - Passos: criar tela de opcoes; permitir adicionar/remover dominios/origens; persistir configuracao em `chrome.storage.local`; solicitar permissoes de host para origens configuradas quando viavel; mostrar quais dominios estao ativos.
    - Arquivos/area: `src/options.*`, `src/storage.ts`, `manifest.json`.
    - Pronto quando: Fernando consegue escolher `pluzo.top`, `pluzo.shop` ou dominio de cliente sem alterar codigo.

- [ ] 4. Capturar requests continuamente no background
    - Passos: usar eventos `chrome.webRequest` somente leitura para requests dos dominios configurados; coletar URL, method, type, status, response headers e timestamps; sanitizar headers sensiveis; associar request a aba/origem; manter historico local limitado.
    - Arquivos/area: `src/background.ts`, `src/storage.ts`, `manifest.json`.
    - Pronto quando: navegar em dominio monitorado registra requisicoes mesmo sem abrir DevTools.

- [ ] 5. Implementar janela destacada de monitoramento
    - Passos: abrir dashboard em janela `popup` via `chrome.windows.create`; mostrar resumo de requests e status de cache; permitir pausar, limpar e fechar; persistir tamanho/posicao quando viavel; permitir reabrir a mesma janela sem duplicar varias instancias.
    - Arquivos/area: `src/background.ts`, `src/dashboard.html`, `src/dashboard.ts`, `src/styles.css`, `src/storage.ts`.
    - Pronto quando: janela continua aberta durante a navegacao, pode ser movida para o lado/outro monitor e mostra novos eventos.

- [ ] 6. Filtrar requests relevantes Pluzo
    - Passos: destacar rotas `/`, `/imoveis`, `/imovel/:id`, `/api/filtros`, `/api/filtro-opcoes`, `/api/bairros`, `/sitemap.xml` e `/portais/*.xml`; permitir alternar entre todos os requests do dominio monitorado e apenas relevantes; reduzir ruido de ads/assets.
    - Arquivos/area: `src/diagnostics.ts`, `src/background.ts`, `src/dashboard.ts`, `src/panel.ts`.
    - Pronto quando: requests irrelevantes nao poluem o resumo principal, mas ainda podem ser inspecionados.

- [ ] 7. Implementar parser de headers de cache
    - Passos: parsear `cache-control` em diretivas; ler `cf-cache-status`, `age`, `x-cache`, `x-cache-ttl`, `x-pluzo-ssr-diag`, `server-timing`; extrair `tenantRestCount`, `metadataMemoryHit`, `publicReadModelHit`, `subrequests`, `masterD1`, status e duracoes principais.
    - Arquivos/area: `src/diagnostics.ts`, testes unitarios se houver runner.
    - Pronto quando: parser transforma headers reais em objeto de diagnostico legivel.

- [ ] 8. Classificar origem provavel de cada request
    - Passos: classificar como `Browser cache`, `Cloudflare HIT`, `Worker cache HIT`, `MISS gerado`, `D1 master usado`, `Tenant REST usado`, `Indeterminado`; gerar lista de evidencias por classificacao; tratar `cf-cache-status: HIT` + `x-cache: HIT` + `tenantRestCount=0` como caminho quente OK.
    - Arquivos/area: `src/diagnostics.ts`.
    - Pronto quando: cada request mostra origem provavel e evidencias usadas.

- [ ] 9. Detectar sinais de browser cache
    - Passos: complementar `webRequest` com Performance API via content script para `transferSize`, `encodedBodySize`, `decodedBodySize` e `duration`; usar painel DevTools/HAR quando disponivel; explicar limitacoes quando browser cache nao gera request observavel.
    - Arquivos/area: `src/content.ts`, `src/background.ts`, `src/panel.ts`, `src/diagnostics.ts`.
    - Pronto quando: requests servidos localmente aparecem como cache local quando detectaveis ou como ausentes/indeterminados com orientacao clara.

- [ ] 10. Montar UI do relatorio e painel complementar
    - Passos: criar dashboard em janela destacada com tabela/cards de URL, tipo, status, origem, `cf-cache-status`, `x-cache`, `max-age`, `s-maxage`, `tenantRestCount`, D1 master e tempo; manter resumo compacto no topo; destacar OK/alerta/erro; deixar painel DevTools para investigacao complementar.
    - Arquivos/area: `src/dashboard.html`, `src/dashboard.ts`, `src/panel.html`, `src/panel.ts`, `src/styles.css`.
    - Pronto quando: janela destacada da resposta rapida durante a navegacao e painel permite investigacao detalhada.

- [ ] 11. Implementar painel DevTools opcional
    - Passos: criar `devtools.html`/`devtools.ts`; registrar painel chamado `Pluzo Cache`; capturar HAR via `chrome.devtools.network.getHAR()` e `onRequestFinished` quando DevTools estiver aberto; mesclar dados com historico do background quando possivel.
    - Arquivos/area: `src/devtools.*`, `src/panel.*`, `manifest.json`.
    - Pronto quando: painel aparece no DevTools e complementa o monitoramento continuo com dados HAR.

- [ ] 12. Implementar alertas de politica Pluzo
    - Passos: alertar se `max-age` final for diferente de `60`; alertar se `s-maxage` for diferente de `2592000`; alertar se `tenantRestCount>0`; alertar se rota cacheavel vier sem `x-cache`; alertar se `cf-cache-status` for `BYPASS`, `DYNAMIC` ou `MISS` em rota esperada quente.
    - Arquivos/area: `src/diagnostics.ts`, `src/dashboard.ts`, `src/panel.ts`.
    - Pronto quando: divergencias de cache aparecem como alertas acionaveis enquanto Fernando navega.

- [ ] 13. Adicionar exportacao local de diagnostico
    - Passos: criar botao `Exportar JSON`; incluir timestamp, URL da aba, dominios monitorados, requests diagnosticados e resumo; remover cookies, authorization e headers sensiveis; opcionalmente criar exportacao Markdown curta para suporte.
    - Arquivos/area: `src/panel.ts`, `src/diagnostics.ts`, `src/storage.ts`.
    - Pronto quando: usuario consegue salvar relatorio sem dados sensiveis.

- [ ] 14. Documentar instalacao e uso
    - Passos: criar `README.md`; explicar como instalar em modo desenvolvedor; explicar como configurar dominios; explicar fluxo `configurar dominio -> abrir site -> abrir janela destacada -> navegar`; listar headers interpretados; documentar limitacoes de browser cache e uso opcional do DevTools.
    - Arquivos/area: `README.md`, `docs/requisitos.md`.
    - Pronto quando: uma nova pessoa consegue instalar e rodar diagnostico sem contexto da conversa.

- [ ] 15. Validar com sites reais
    - Passos: testar `https://pluzo.top/`; testar `https://pluzo.shop/`; acionar combos de `Finalidade`, `Tipo de Imovel` e `Cidade`; confirmar janela destacada durante navegacao; confirmar `max-age=60`, `cf-cache-status: HIT`, `x-cache: HIT` e `tenantRestCount=0`; registrar exemplos no README ou em `docs/examples.md` sem dados sensiveis.
    - Arquivos/area: Chrome, `README.md` ou `docs/examples.md`.
    - Pronto quando: relatorio bate com os headers observados via navegador e, quando aplicavel, via `curl`.

- [ ] 16. Revisar permissoes e privacidade
    - Passos: revisar `manifest.json`; restringir `host_permissions`/`optional_host_permissions` conforme dominios configurados; confirmar que a extensao nao envia dados para rede; confirmar que nao grava corpo de resposta por padrao; documentar politica de privacidade local.
    - Arquivos/area: `manifest.json`, `README.md`, `docs/requisitos.md`.
    - Pronto quando: permissoes estao justificadas e sem excesso evidente.

- [ ] 17. Preparar pacote de distribuicao interna
    - Passos: rodar build; carregar extensao buildada no Chrome; testar monitoramento continuo e janela destacada; criar instrucoes para empacotar `.zip` interno se necessario; nao commitar build se `.gitignore` bloquear.
    - Arquivos/area: build output, `README.md`, `.gitignore`.
    - Pronto quando: extensao pode ser instalada por Fernando/devs para diagnostico real.
