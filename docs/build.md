# Build E Pacote Dist

<!-- DOC-GUARD: Sempre que a extensao for alterada, manter `dist/` atualizado com `npm run build`. Alterar somente com pedido/autorizacao explicita de Fernando. -->

## Regra

Sempre que qualquer arquivo da extensao for alterado, rode `npm run build` antes de concluir a tarefa para deixar o pacote `dist/` atualizado.

## Validacao Recomendada

- `npm run typecheck`
- `npm run build`
- `npm run smoke:headless` quando a mudanca afetar captura, manifest, background, content script, diagnostico ou build.

## Observacao

`dist/` deve ficar atualizado no workspace local para carregamento em `chrome://extensions`, mas nao deve ser commitado salvo pedido explicito.
