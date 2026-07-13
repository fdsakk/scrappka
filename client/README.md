# Scrappka — Client

Frontend dla systemu mapowania stron, scrapowania podstron i eksportu bazy wiedzy.
Built with **React 19**, **TanStack Router**, **TanStack Query**, **Tailwind CSS 4**, **Vite**.

## Development

```bash
bun install
bun run dev
```

Dev server Vite działa na porcie `3000`. Do pełnego flow produkcyjnego użyj
serwera Bun z głównego katalogu (`bun run app`), który serwuje SPA pod `/app`.

## Build

```bash
bun run build
```

Produkcyjny build trafia do `client/dist/`, skąd serwuje go serwer Bun pod `/app/*`.

## Checks

```bash
bun run test    # Vitest
bun run lint    # Biome
bun run check   # Biome (full check)
```

## Routing

- Plikowe route'y w `src/routes/`
- TanStack Router generuje `src/routeTree.gen.ts` — nie edytować ręcznie
- Code splitting włączony w `vite.config.ts`

## Views

| Route | Widok |
|---|---|
| `/` | Strona główna — input URL, lista projektów |
| `/$host/$timestamp` | Szczegóły projektu — mapowanie, lista podstron, scrapowanie, pliki i eksport knowledge ZIP |

## Architektura aplikacji

Pełny opis pipeline'u (scrape → baza wiedzy → OpenSpec) znajduje się w głównym [`README.md`](../README.md).
