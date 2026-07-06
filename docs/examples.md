# Exemplos De Validacao

Este arquivo registra validacoes sem dados sensiveis.

## Fluxo Manual Esperado

- Instalar `dist/` em modo desenvolvedor.
- Abrir janela destacada da extensao.
- Configurar `https://pluzo.top` e `https://pluzo.shop`.
- Navegar pelas home pages e por filtros.
- Confirmar que HTML e APIs aparecem no dashboard.
- Confirmar que a janela pode ser movida para outro monitor.
- Confirmar headers `cache-control`, `cf-cache-status`, `x-cache`, `x-pluzo-ssr-diag` e `server-timing` quando presentes.

## Headers Esperados

- Rotas publicas cacheaveis devem mostrar `max-age=60`.
- Rotas publicas cacheaveis devem mostrar `s-maxage=2592000`.
- `cf-cache-status: HIT` indica Cloudflare HIT; quando vier junto com `x-cache: HIT`, a extensao mostra `Cloudflare + Worker HIT`.
- `x-cache: HIT` deve aparecer como Worker cache HIT.
- `tenantRestCount=0` deve aparecer como caminho sem tenant REST.

## Validacao Via Curl - 2026-07-06

`https://pluzo.top/` retornou:

- `status: 200`
- `cf-cache-status: HIT`
- `age: 12288`
- `cache-control: public, max-age=60, s-maxage=2592000, stale-while-revalidate=2592000`
- `x-cache: HIT`
- `x-cache-ttl: 2592000`
- `x-pluzo-ssr-diag: tenantRestCount=0;...;subrequests=cache:1|masterD1:2;status=200`

`https://pluzo.shop/` retornou:

- `status: 200`
- `cf-cache-status: HIT`
- `age: 12839`
- `cache-control: public, max-age=60, s-maxage=2592000, stale-while-revalidate=2592000`
- `x-cache: HIT`
- `x-cache-ttl: 2592000`
- `x-pluzo-ssr-diag: tenantRestCount=0;...;subrequests=cache:1|masterD1:2;status=200`

Chamadas diretas a `/api/filtro-opcoes` sem parametros retornaram `400`, mas ainda expuseram `x-pluzo-ssr-diag` e `server-timing`, permitindo validar parser de D1/tenant REST.

## Smoke Headless Automatizado - 2026-07-06

Comando executado:

```bash
npm run smoke:headless
```

Resultado:

```json
{
  "ok": true,
  "captured": "numero varia por recursos auxiliares carregados",
  "homes": [
    {
      "url": "https://pluzo.top/",
      "origin": "Cloudflare + Worker HIT",
      "cfCacheStatus": "HIT",
      "xCache": "HIT",
      "tenantRestCount": 0
    },
    {
      "url": "https://pluzo.shop/",
      "origin": "Cloudflare + Worker HIT",
      "cfCacheStatus": "HIT",
      "xCache": "HIT",
      "tenantRestCount": 0
    }
  ]
}
```

O smoke valida que Chromium carregou o `dist/`, a extensao registrou requests reais em `pluzo.top` e `pluzo.shop`, e as homes foram classificadas como `Cloudflare + Worker HIT`. Validacao de movimentacao da janela para outro monitor ainda precisa ser feita manualmente em Chrome com interface grafica.

## Observacao

Browser cache local pode aparecer apenas pela Performance API quando nao houver request observavel pelo `webRequest`.
