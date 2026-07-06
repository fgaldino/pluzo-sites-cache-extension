# Requisitos - Pluzo Sites Cache Extension

<!-- DOC-GUARD: Mantem monitoramento continuo, dominios configuraveis e janela destacada movivel para outro monitor. Alterar somente com pedido/autorizacao explicita de Fernando. -->

## Proposta

A extensao deve registrar continuamente as requisicoes observaveis enquanto Fernando navega em sites monitorados e indicar, para cada requisicao, a origem provavel da informacao: browser cache, Cloudflare cache, Worker SSR cache, D1 master, tenant REST ou indeterminado.

## Comportamento Obrigatorio

- Monitorar requisicoes durante a navegacao normal do site, nao apenas em um relatorio aberto depois.
- Permitir configurar quais dominios/origens devem ser monitorados.
- Monitorar apenas dominios configurados e autorizados pelo usuario.
- Mostrar diagnostico local, sem enviar dados para backend externo.
- Exibir uma janela destacada da extensao quando habilitada.
- Permitir manter a janela aberta enquanto o usuario navega no site monitorado.
- Permitir mover a janela para o lado do website ou para outro monitor usando o gerenciador de janelas do sistema.
- Persistir tamanho e posicao da janela localmente quando viavel.
- A pagina principal da janela destacada deve ocupar 100% da largura disponivel, sem largura maxima de conteudo.
- A pagina principal nao deve exibir colunas de `Headers` nem `Evidencias`; esses dados devem continuar salvos em memoria local e exportaveis no JSON.
- A lista principal deve exibir uma coluna `Tempo` com a duracao observada da resposta do endpoint.
- A lista principal deve permitir ordenar ao clicar nos cabecalhos das colunas.
- A lista principal deve permitir filtrar por uma ou mais opcoes da coluna `Origem`.
- A lista principal deve permitir ativar `Agrupar request`, agrupando por metodo + URL exata, incluindo query string.
- Se o mesmo request exato fizer 2 ou mais requisicoes GET relevantes em ate 5 minutos e todas continuarem sem evidencia de browser cache, Cloudflare HIT ou Worker cache HIT, a ultima coluna deve mostrar um botao para copiar um prompt de diagnostico para IA.
- O prompt copiado deve explicar o problema, incluir endpoint, janela analisada, tempos, status, classificacao, headers cacheaveis salvos e alertas, sem incluir headers sensiveis.
- Quando `fromCache=true` ou `transferSize=0` vier junto com headers de servidor mostrando `x-cache: MISS`, `tenantRestCount>0` ou `masterD1>0`, a extensao deve considerar a resposta como problema de cache/servidor, nao como cache bom.
- Permitir ocultar, mostrar, limpar e pausar o monitoramento sem alterar o site.
- Tratar falta de evidencia como `indeterminado`.

## Decisao De UI

O "popup sempre visivel" deve ser implementado como uma janela destacada da extensao via `chrome.windows`, nao como popup nativo da toolbar. O popup nativo fecha ao perder foco. O overlay injetado no website nao e obrigatorio nesta fase, porque Fernando aceita posicionar a janela ao lado do site ou em outro monitor.

## Evidencias De Diagnostico

- `cf-cache-status: HIT` indica cache Cloudflare.
- `x-cache: HIT` indica cache interno do Worker SSR.
- Quando `cf-cache-status: HIT` e `x-cache: HIT` aparecem juntos, exibir como `Cloudflare + Worker HIT` para nao esconder que o Worker cache tambem participou.
- `x-pluzo-ssr-diag` com `tenantRestCount=0` indica ausencia de fallback tenant REST.
- `x-pluzo-ssr-diag` com `tenantRestCount>0` indica uso de tenant REST.
- `x-pluzo-ssr-diag` com `masterD1:N` indica consulta ao D1 master.
- `server-timing` pode complementar tempos e etapas internas quando presente.
- Sinais da Performance API podem indicar browser cache quando `transferSize` for zero ou quando o navegador nao emitir nova requisicao de rede observavel.

## Privacidade

- Nao capturar corpo de resposta por padrao.
- Nao guardar cookies, authorization, tokens ou headers sensiveis.
- Nao modificar headers, bloquear requests, fazer purge ou alterar dados.
- Armazenar configuracoes e relatorios localmente no navegador.

## Validacao Minima

- Configurar `pluzo.top`, abrir a janela destacada e navegar pelo site.
- Confirmar que requisicoes HTML/API aparecem enquanto a navegacao acontece.
- Confirmar que a janela destacada continua aberta durante a navegacao e pode ser movida para o lado ou para outro monitor.
- Repetir com `pluzo.shop`.
- Confirmar diagnosticos para `cf-cache-status`, `x-cache`, `cache-control`, `x-pluzo-ssr-diag`, D1 e tenant REST quando os headers existirem.
