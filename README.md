# Pluzo Sites Cache Extension

Extensao Chrome Manifest V3 para diagnosticar, localmente, como sites publicos Pluzo carregam paginas e APIs de filtro.

## Proposta

- Registrar requests enquanto Fernando navega nos dominios monitorados.
- Classificar origem provavel: browser cache, Cloudflare HIT, Worker cache HIT, MISS gerado, D1 master, tenant REST ou indeterminado.
- Mostrar uma janela destacada movivel para outro monitor.
- Usar toda a largura disponivel na janela principal, sem colunas tecnicas de headers/evidencias.
- Manter um painel DevTools opcional para complementar com HAR quando DevTools estiver aberto.
- Nao enviar dados para backend externo.

## Instalar Em Desenvolvimento

1. Rode `npm install`.
2. Rode `npm run build`.
3. Abra `chrome://extensions`.
4. Ative `Developer mode`.
5. Clique em `Load unpacked`.
6. Selecione a pasta `dist/`.

## Uso

1. Clique no icone da extensao para abrir a janela destacada.
2. Abra `Dominios` e adicione os hosts a monitorar, como `pluzo.top`, `pluzo.shop` ou dominio de cliente.
3. Navegue no site monitorado.
4. Deixe a janela ao lado do navegador ou em outro monitor.
5. Use `Apenas relevantes` para focar em paginas, filtros, bairros, sitemap e portais XML.
6. Use `Exportar JSON` para salvar o diagnostico local sem headers sensiveis.

A janela principal mostra resumo, origem, status e alertas. Headers e evidencias ficam salvos localmente e aparecem no JSON exportado; o painel DevTools pode ser usado para investigacao tecnica.

Controles da lista:

- Clique no cabecalho de uma coluna para ordenar; clique novamente para inverter a ordem.
- Use os chips de `Origem` para filtrar por uma ou mais classificacoes.
- Ative `Agrupar request` para agrupar por metodo + URL exata, incluindo query string.

Quando o mesmo request exato GET relevante aparece 2 ou mais vezes em ate 5 minutos sem browser cache, Cloudflare HIT ou Worker cache HIT, a ultima coluna mostra `Copiar prompt`. Esse prompt resume o problema para enviar a uma IA investigar causa e solucao.

## Headers Interpretados

- `cache-control`: extrai `max-age` e `s-maxage`.
- `cf-cache-status`: `HIT` indica Cloudflare cache.
- `age`: evidencia de cache intermediario.
- `x-cache`: `HIT` indica cache interno do Worker SSR.
- `x-cache-ttl`: TTL interno quando presente.
- `x-pluzo-ssr-diag`: extrai `tenantRestCount`, `masterD1`, `metadataMemoryHit`, `publicReadModelHit` e `subrequests`.
- `server-timing`: complementa tempos internos quando presente.

Quando `cf-cache-status: HIT` e `x-cache: HIT` aparecem juntos, a origem exibida e `Cloudflare + Worker HIT`.

## Rotas Relevantes

- `/`
- `/imoveis`
- `/imovel/:id`
- `/api/filtros`
- `/api/filtro-opcoes`
- `/api/bairros`
- `/sitemap.xml`
- `/portais/*.xml`

## Alertas

- `max-age` diferente de `60` em rota cacheavel.
- `s-maxage` diferente de `2592000` em rota cacheavel.
- `tenantRestCount>0`.
- Rota cacheavel sem `x-cache`.
- `cf-cache-status` `BYPASS`, `DYNAMIC` ou `MISS` em rota esperada quente.
- Mesmo endpoint repetido 2+ vezes em 5 minutos sem cache observado.

## Privacidade

- Tudo e processado localmente no navegador.
- A extensao nao captura corpo de resposta por padrao.
- A extensao remove `cookie`, `set-cookie`, `authorization`, `proxy-authorization`, `x-api-key` e `x-auth-token` dos dados salvos.
- A extensao nao altera headers, nao bloqueia requests, nao faz purge e nao escreve em dados Pluzo.

## Limitacoes

- Browser cache pode nao gerar request de rede observavel.
- Quando possivel, a extensao usa Performance API para inferir browser cache via `transferSize=0`.
- DevTools aberto depois da pagina carregar pode perder requests antigos; recarregue a pagina com DevTools aberto para capturar HAR completo.
- Janela destacada pode ser movida para outro monitor, mas Chrome Extension nao garante `always on top`.

## Validacao

Comandos locais:

```bash
npm run typecheck
npm run build
npm run smoke:headless
```

Validacao manual esperada:

1. Carregar `dist/` em `chrome://extensions`.
2. Abrir janela destacada da extensao.
3. Configurar `https://pluzo.top` e navegar.
4. Confirmar requests HTML/API no relatorio.
5. Mover a janela para o lado ou outro monitor.
6. Repetir com `https://pluzo.shop`.
7. Abrir DevTools antes do reload e confirmar painel `Pluzo Cache`.

O smoke headless carrega `dist/` no Chromium, navega em `https://pluzo.top/` e confirma que a extensao registrou a request HTML principal no `chrome.storage.local`.
