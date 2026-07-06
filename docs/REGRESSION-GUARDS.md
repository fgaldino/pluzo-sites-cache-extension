# Regression Guards

## Monitoramento Continuo E Janela Destacada

- Guardiao: `docs/requisitos.md` e `TAREFAS.md`.
- Regra: a extensao deve registrar requisicoes enquanto o usuario navega nos dominios configurados e mostrar uma janela destacada movivel para o lado ou outro monitor.
- Nao trocar por fluxo dependente apenas de DevTools, popup nativo da toolbar ou overlay obrigatorio sem pedido/autorizacao explicita de Fernando.

## Dashboard Principal

- Guardiao: `docs/requisitos.md`, `src/dashboard.html` e `src/dashboard-app.ts`.
- Regra: a pagina principal deve usar toda a largura disponivel e nao deve exibir colunas `Headers` nem `Evidencias`.
- Headers e evidencias devem continuar salvos em memoria local e no JSON exportado.

## Dist Atualizado

- Guardiao: `docs/build.md` e `AGENTS.md`.
- Regra: toda alteracao da extensao deve rodar `npm run build` antes da conclusao para deixar `dist/` atualizado localmente.
- Nao commitar `dist/` sem pedido explicito.
