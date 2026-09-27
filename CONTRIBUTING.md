# Contributing

Thanks for your interest in improving Quiet Tab.

## Requirements

- Node.js 20 or newer (the test and check scripts use the built-in test runner
  and `node --check`).
- No third-party dependencies — keep it that way unless there is a strong reason.

## Local development

1. Clone the repository.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   and select the repository directory.
3. Open a new tab to exercise the favorites toolbar and weather panel. Reload
   the extension after changes.

## Tests and checks

```bash
npm test       # node --test over test/*.test.js
npm run check  # node --check over every file in src/
```

Both must pass before opening a pull request.

## Conventions

- Render UI text only through DOM text nodes (`textContent`); never `innerHTML`.
- The persisted favorites schema is validated by `isFavoritesState`; the
  persisted weather schema is validated by `isWeatherLocation`/
  `isWeatherCache`. If you add a field, update the matching validator and
  its tests.
- Follow the existing module boundaries: favorites persistence
  (`favoritesStore.js`), favorites mutations (`favoritesService.js`),
  weather API client (`weatherApi.js`), weather persistence
  (`weatherStore.js`), weather mutations (`weatherService.js`), UI
  (`newtab.js`).

## Pull requests

- Keep changes focused; one logical change per PR.
- Add or update tests for behaviour changes.
- Update `CHANGELOG.md` under `[Unreleased]`.
