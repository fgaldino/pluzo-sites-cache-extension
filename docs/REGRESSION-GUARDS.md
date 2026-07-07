# Regression Guards

## Monitoramento Continuo E Janela Destacada

- Guardiao: `docs/requisitos.md` e `TAREFAS.md`.
- Regra: a extensao deve registrar requisicoes enquanto o usuario navega nos dominios configurados e mostrar uma janela destacada movivel para o lado ou outro monitor.
- Nao trocar por fluxo dependente apenas de DevTools, popup nativo da toolbar ou overlay obrigatorio sem pedido/autorizacao explicita de Fernando.

## Dashboard Principal

- Guardiao: `docs/requisitos.md`, `src/dashboard.html` e `src/dashboard-app.ts`.
- Regra: a pagina principal deve usar toda a largura disponivel e nao deve exibir colunas `Headers` nem `Evidencias`.
- Headers e evidencias devem continuar salvos em memoria local e no JSON exportado.

## Diagnostico Inteligente De Cache

- Guardiao: `docs/requisitos.md`, `src/cache-problems.ts` e `src/dashboard-app.ts`.
- Regra: se o mesmo request exato GET relevante aparecer 2+ vezes em 5 minutos sem browser cache, Cloudflare HIT ou Worker cache HIT, a ultima coluna deve mostrar botao `Copiar prompt`.
- O prompt deve incluir endpoint, janela, tempos, status, classificacao, headers de cache salvos e alertas, sem headers sensiveis.
- Se `fromCache=true`/`transferSize=0` vier junto com headers antigos `MISS`, `tenantRestCount>0` ou `masterD1>0`, classificar a ocorrencia atual como browser cache; D1/REST desses headers entra apenas como geracao original.
- A mesma request capturada por `webRequest`, `Performance API` e `DevTools HAR` deve aparecer como uma unica linha, preservando os melhores headers disponiveis.

## Controles Da Lista

- Guardiao: `docs/requisitos.md`, `src/dashboard.html`, `src/panel.html` e `src/dashboard-app.ts`.
- Regra: clique no cabecalho ordena a coluna e novo clique inverte a direcao.
- Regra: filtro de `Origem` permite escolher uma ou mais opcoes da coluna origem.
- Regra: `Agrupar request` agrupa por metodo + URL exata, incluindo query string.

## Classificacao Cloudflare E Worker

- Guardiao: `docs/requisitos.md` e `src/diagnostics.ts`.
- Regra: quando `cf-cache-status: HIT` e `x-cache: HIT` aparecem juntos, a origem exibida deve ser `Cloudflare + Worker HIT`, nao apenas `Cloudflare HIT`.

## Dist Atualizado

- Guardiao: `docs/build.md` e `AGENTS.md`.
- Regra: toda alteracao da extensao deve rodar `npm run build` antes da conclusao para deixar `dist/` atualizado localmente.
- Nao commitar `dist/` sem pedido explicito.
