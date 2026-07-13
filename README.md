# Scrappka — baza wiedzy do analizy i odbudowy strony

Aplikacja zbiera zawartość publicznej strony internetowej, porządkuje ją i
tworzy paczkę wiedzy, którą można przekazać lokalnemu agentowi AI. Agent na jej
podstawie przygotowuje **OpenSpec** — opis zakresu, architektury, wymagań i zadań
potrzebnych do odbudowy strony.

> Aplikacja nie kopiuje strony 1:1, nie generuje gotowego serwisu i sama nie
> wysyła danych do modelu AI. Zbieranie danych oraz późniejsze uruchomienie
> agenta to dwa osobne etapy kontrolowane przez użytkownika.

## W skrócie

```text
Adres strony
    ↓
Mapowanie publicznych podstron
    ↓
Wybór i scrapowanie potrzebnych treści
    ↓
Baza wiedzy + raport jakości + PROMPT.md
    ↓
Lokalny agent AI
    ↓
OpenSpec dla zespołu projektowego i wdrożeniowego
```

Aplikacja przydaje się, gdy firma chce:

- przygotować przebudowę istniejącej strony;
- zinwentaryzować treści, ofertę, formularze i strukturę serwisu;
- zaplanować migrację treści do nowego CMS-a;
- wykryć powtarzalne typy stron, np. produkty, kategorie i artykuły;
- przygotować uporządkowany materiał wejściowy dla projektantów, programistów
  lub agenta AI.

## Najważniejsze pojęcia

| Pojęcie              | Znaczenie                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mapowanie**        | Odkrywanie adresów podstron przez sitemapę i linki wewnętrzne. Na tym etapie aplikacja tworzy listę URL-i, ale nie zapisuje jeszcze pełnej treści każdej strony. |
| **Scrapowanie**      | Pobranie wybranej podstrony, oczyszczenie jej z elementów technicznych i zapisanie treści jako Markdown.                                                         |
| **Baza wiedzy**      | Uporządkowany zestaw treści, faktów, szablonów stron, danych marki i raportów jakości.                                                                           |
| **OpenSpec**         | Dokumentacja opisująca, co ma zostać zbudowane: cel, decyzje projektowe, wymagania, scenariusze i lista zadań. Nie jest to gotowy kod strony.                    |
| **Lokalny agent AI** | Narzędzie uruchomione przez użytkownika na jego komputerze, np. Claude Code, Cursor lub aider. Agent czyta wyeksportowane pliki zgodnie z `PROMPT.md`.           |

## Jak korzystać z aplikacji

### 1. Otwórz aplikację

Po uruchomieniu wejdź na:

```text
http://localhost:3000/app
```

Na stronie głównej znajduje się pole na adres oraz lista wcześniejszych
projektów. Każde mapowanie tworzy osobny projekt, więc można wielokrotnie
analizować tę samą domenę bez nadpisywania wcześniejszych danych.

### 2. Wprowadź adres strony

Wpisz pełny publiczny adres, najlepiej stronę główną:

```text
https://example.com
```

Kliknij **Mapuj**. Aplikacja:

1. sprawdzi, czy adres jest publiczny i bezpieczny;
2. odczyta `robots.txt` oraz dostępne sitemapy;
3. przejdzie po linkach wewnętrznych;
4. pokaże odkrywane podstrony na bieżąco.

Mapowanie można zatrzymać. Już odnalezione adresy zostaną zachowane i nadal
będzie można je zescrapować.

### 3. Wybierz podstrony do scrapowania

Po mapowaniu lista **Oczekujące** zawiera odkryte adresy. Można:

- wyszukiwać po fragmencie URL-a;
- filtrować typ strony;
- zaznaczyć widoczną stronę wyników albo wszystkie wyniki filtra;
- ponownie uruchomić pozycje zakończone błędem.

Domyślnie aktywny jest filtr **Treść**. To najbezpieczniejszy wybór na początek.

| Typ                 | Co zwykle zawiera                                         | Zalecenie                                                                          |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Treść**           | Strona główna, oferta, produkt, usługa, artykuł, kontakt  | Zwykle warto scrapować.                                                            |
| **Listingi**        | Kategorie, tagi, archiwa, paginacja i wyniki wyszukiwania | Wybieraj, jeśli ich układ lub opis kategorii ma znaczenie.                         |
| **Dokumenty**       | Linki do PDF-ów i innych dokumentów                       | Są rejestrowane, ale obecny scraper treści jest przeznaczony głównie dla HTML.     |
| **Obrazy / zasoby** | Grafiki, skrypty, arkusze stylów i pliki techniczne       | Zwykle nie należy ich scrapować jako stron. Informacje o marce są zbierane osobno. |

#### Zalecany minimalny zestaw

Nie trzeba wybierać całej witryny. Dla czytelnego materiału warto zacząć od:

- strony głównej;
- „O firmie” / „O nas”;
- kontaktu i wszystkich istotnych formularzy;
- głównych stron oferty lub usług;
- stron kategorii;
- 3–5 reprezentatywnych produktów, usług lub artykułów z każdego rodzaju;
- ważnych stron informacyjnych, np. dostawa, płatności, FAQ;
- regulaminów i polityk tylko wtedy, gdy mają wejść do zakresu przebudowy.

Jeśli witryna ma wiele podobnych produktów, aplikacja sama spróbuje rozpoznać
wspólny szablon i zapisać produkty jako dane, zamiast tworzyć osobne wymaganie
dla każdej podstrony.

### 4. Uruchom scrapowanie

Kliknij **Scrapuj zaznaczone**. Status każdej pozycji będzie aktualizowany na
bieżąco:

| Status        | Znaczenie                                                                         |
| ------------- | --------------------------------------------------------------------------------- |
| **Oczekuje**  | Adres został odkryty, ale jego treść nie została jeszcze pobrana.                 |
| **Scrapuje**  | Treść jest aktualnie pobierana i przetwarzana.                                    |
| **Gotowe**    | Treść została zapisana poprawnie.                                                 |
| **Bez zmian** | Strona została sprawdzona ponownie, ale jej treść się nie zmieniła.               |
| **Błąd**      | Nie udało się pobrać lub przetworzyć strony; szczegóły są dostępne przy statusie. |

Najczęstsze przyczyny błędów to blokada serwera, timeout, strona wymagająca
logowania, odpowiedź inna niż HTML albo witryna renderowana wyłącznie przez
JavaScript.

### 5. Sprawdź wynik

W sekcji zescrapowanych stron można:

- otworzyć oryginalny URL;
- podejrzeć oczyszczony plik `raw.md`;
- pobrać `raw.md` dla pojedynczej podstrony.

Przed eksportem warto ręcznie sprawdzić kilka najważniejszych stron. Jeśli
brakuje kluczowej treści, lepiej poprawić wybór URL-i lub ponowić mapowanie niż
oczekiwać, że agent AI odtworzy brakujące informacje.

### 6. Pobierz bazę wiedzy

Kliknij **Baza wiedzy (ZIP)**. Przy każdym pobraniu aplikacja buduje aktualną
bazę z podstron oznaczonych jako **Gotowe** lub **Bez zmian**.

ZIP zawiera:

```text
PROMPT.md
knowledge/
├── site.md
├── audit.md
├── audit.json
├── brand.json
├── facts.jsonl
├── facts-review.jsonl       # tylko gdy istnieją niepewne fakty
├── templates/
├── data/
├── content/
├── raw/
└── diagnostics/
```

## Co znajduje się w bazie wiedzy

| Plik / katalog                 | Do czego służy                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `PROMPT.md`                    | Główna instrukcja dla agenta AI. Określa kolejność pracy, zasady jakości i format końcowego OpenSpeca.                    |
| `knowledge/site.md`            | Punkt startowy dla człowieka i agenta: inwentarz stron, nawigacja, drzewo URL-i i rozpoznane typy podstron.               |
| `knowledge/audit.md`           | Czytelny raport jakości: słabe ekstrakcje, duplikaty, klastry i elementy wymagające ręcznej kontroli.                     |
| `knowledge/audit.json`         | Ten sam audyt w formacie maszynowym.                                                                                      |
| `knowledge/content/*.md`       | Oczyszczone treści unikalnych stron, np. strony głównej, kontaktu lub „O nas”.                                            |
| `knowledge/templates/*.md`     | Opis wspólnego układu powtarzalnych stron, np. produktów lub artykułów.                                                   |
| `knowledge/data/*.jsonl`       | Dane poszczególnych elementów klastra; jeden obiekt JSON w każdym wierszu. Mogą być później podstawą importu do CMS-a.    |
| `knowledge/facts.jsonl`        | Fakty o podwyższonej wiarygodności: ceny, daty, wymiary, dane kontaktowe, identyfikatory i inne wartości wraz ze źródłem. |
| `knowledge/facts-review.jsonl` | Niepewne wartości. Nie wolno traktować ich jako zatwierdzonych bez sprawdzenia przez człowieka. Plik może nie wystąpić.   |
| `knowledge/brand.json`         | Automatycznie wykryte kolory, fonty, logo i favicon. To materiał pomocniczy, nie kompletny brand book.                    |
| `knowledge/diagnostics/*.json` | Pewność ekstrakcji i ostrzeżenia dla każdej strony.                                                                       |
| `knowledge/raw/*.md`           | Oryginalny wynik scrapowania. Używany awaryjnie, gdy treść oczyszczona jest niepełna.                                     |

## Jak wykorzystać wygenerowaną bazę

### Krok 1. Rozpakuj ZIP do osobnego katalogu

Nie uruchamiaj agenta bezpośrednio w katalogu źródłowym tej aplikacji. Utwórz
osobny katalog roboczy dla analizowanej strony, np.:

```text
projekty/
└── example-com-rebuild/
    ├── PROMPT.md
    └── knowledge/
```

### Krok 2. Wykonaj krótką kontrolę człowieka

Przed uruchomieniem AI osoba znająca firmę powinna:

1. przeczytać `knowledge/audit.md`;
2. sprawdzić pozycje z sekcji ręcznego przeglądu;
3. zweryfikować ważne ceny, daty, telefony i dane firmy w `facts.jsonl`;
4. zatwierdzić albo odrzucić wartości z `facts-review.jsonl`;
5. sprawdzić, czy `brand.json` wskazuje właściwe logo i kolory;
6. upewnić się, że w bazie są wszystkie kluczowe obszary oferty.

To ważny etap: agent ma nie wymyślać brakujących informacji. Jeśli czegoś nie
ma w bazie, należy doscrapować odpowiednią stronę albo dostarczyć zatwierdzony
materiał osobno.

### Krok 3. Otwórz katalog w lokalnym agencie AI

Uruchom wybrane narzędzie w rozpakowanym katalogu. Można przekazać agentowi
krótkie polecenie:

```text
Przeczytaj PROMPT.md i wykonaj wszystkie opisane w nim kroki.
Traktuj knowledge/site.md oraz knowledge/content/ jako źródło prawdy.
Nie używaj facts-review.jsonl bez mojego zatwierdzenia.
Na końcu pokaż listę elementów wymagających decyzji człowieka.
```

`PROMPT.md` instruuje agenta, aby:

1. przygotował opis tonu komunikacji w `knowledge/brand.md`;
2. uporządkował treści bez dodawania nowych faktów;
3. utworzył pakiet OpenSpec w:

```text
openspec/changes/rebuild-scraped-site/
├── proposal.md
├── design.md
├── tasks.md
└── specs/site-rebuild/spec.md
```

### Krok 4. Zweryfikuj rezultat agenta

Gotowy OpenSpec powinien zostać przeczytany przez właściciela biznesowego,
projektanta i osobę techniczną. Należy sprawdzić przede wszystkim:

- czy zakres odpowiada celowi projektu;
- czy oferta i dane firmy są zgodne z prawdą;
- czy agent nie zmienił znaczenia treści;
- czy formularze i wezwania do działania są kompletne;
- czy zadania wdrożeniowe mają właścicieli i właściwą kolejność;
- czy kwestie oznaczone `REQUIRES REVIEW` zostały rozwiązane.

Jeśli środowisko ma zainstalowane narzędzie OpenSpec, format można sprawdzić
poleceniem uruchomionym w katalogu eksportu:

```bash
npx openspec validate
```

### Krok 5. Przekaż materiały do realizacji

Zatwierdzony pakiet można wykorzystać jako:

- brief dla software house'u lub zespołu wewnętrznego;
- punkt startowy do projektu UX/UI;
- specyfikację dla kolejnego agenta implementacyjnego;
- plan migracji danych do CMS-a;
- checklistę odbioru nowej strony.

## Dobre praktyki i ograniczenia

- Analizuj wyłącznie strony, do których firma ma prawo i które wolno
  automatycznie pobierać. Aplikacja respektuje reguły `robots.txt`.
- Baza może zawierać dane osobowe lub biznesowe widoczne publicznie. Traktuj ZIP
  jak dokument firmowy i nie wysyłaj go do niezatwierdzonych usług.
- Strony wymagające logowania oraz aplikacje renderowane wyłącznie przez
  JavaScript mogą dać niepełny wynik.
- Automatyczne rozpoznanie marki jest orientacyjne. Nie zastępuje księgi znaku,
  plików źródłowych logo ani decyzji projektanta.
- Klasyfikacja stron i ekstrakcja faktów są heurystyczne. `audit.md` oraz ręczna
  kontrola są częścią procesu, a nie opcjonalnym dodatkiem.
- Powtarzalne i zduplikowane strony są celowo grupowane, aby OpenSpec nie był
  przeładowany setkami identycznych wymagań.
- Aplikacja nie wykonuje zrzutów ekranów i nie gwarantuje odwzorowania wyglądu
  piksel w piksel.

## Uruchomienie — Docker (zalecane w firmie)

Wymagania: Docker z obsługą Compose.

1. Sklonuj repozytorium i przejdź do jego katalogu.
2. Utwórz `.env` na podstawie `.env.example`.
3. Ustaw hasło dostępu, jeśli aplikacja ma być dostępna w sieci firmowej:

```dotenv
AUTH_USERNAME=admin
AUTH_PASSWORD=ustaw-dlugie-losowe-haslo
```

4. Zbuduj i uruchom aplikację jednym poleceniem:

```bash
docker compose up -d --build
```

5. Otwórz `http://localhost:3000/app`.

Dane projektów są przechowywane w wolumenie Dockera `scrappka_data` i pozostają
po restarcie kontenera. Ustawienie `AUTH_PASSWORD` zabezpiecza aplikację Basic
Auth; endpoint healthcheck pozostaje dostępny dla Dockera.

Przydatne polecenia:

```bash
# logi
docker compose logs -f app

# zatrzymanie aplikacji bez usuwania danych
docker compose down

# ponowne zbudowanie po aktualizacji kodu
docker compose up -d --build
```

Nie używaj `down -v`, jeśli chcesz zachować projekty — parametr `-v` usuwa
wolumen z danymi.

## Uruchomienie lokalne

Wymagania:

- Bun;
- systemowe polecenie `zip` do tworzenia eksportu.

```bash
# zależności serwera
bun install

# zależności klienta
cd client
bun install
cd ..

# build klienta i uruchomienie aplikacji na porcie 3000
bun run app
```

Testy i kontrola typów:

```bash
# serwer, pipeline wiedzy i testy współdzielone
bun run check

# klient
cd client
bunx tsc --noEmit
bun run check
bun run test
```

## Konfiguracja

Wszystkie zmienne są opcjonalne. Przykłady znajdują się w `.env.example`.

| Zmienna                     |        Domyślnie | Znaczenie                                                   |
| --------------------------- | ---------------: | ----------------------------------------------------------- |
| `PORT`                      |           `3000` | Port aplikacji.                                             |
| `SCRAPED_DIR`               | `./scraped_data` | Katalog danych projektów.                                   |
| `AUTH_USERNAME`             |          `admin` | Login Basic Auth, używany tylko po ustawieniu hasła.        |
| `AUTH_PASSWORD`             |            puste | Włącza Basic Auth, gdy ma niepustą wartość.                 |
| `SCRAPER_UA`                |   WebScrapperBot | User-Agent wysyłany do analizowanych stron.                 |
| `SCRAPER_TIMEOUT_MS`        |          `15000` | Timeout pojedynczego żądania HTTP.                          |
| `SCRAPER_MAX_BYTES`         |       `10000000` | Maksymalny rozmiar pojedynczej odpowiedzi.                  |
| `SCRAPER_CRAWL_CONCURRENCY` |              `5` | Liczba równoległych żądań podczas mapowania.                |
| `SCRAPER_DISCOVER_BATCH`    |             `25` | Wielkość partii odkrytych URL-i zapisywanych do projektu.   |
| `SCRAPER_DISCOVER_LIMIT`    |           `5000` | Maksymalna liczba URL-i w jednym mapowaniu.                 |
| `SCRAPER_STALL_TIMEOUT_MS`  |         `120000` | Czas bez aktywności, po którym mapowanie zostaje przerwane. |
| `SCRAPE_CONCURRENCY`        |              `8` | Liczba równolegle scrapowanych stron.                       |

Zwiększanie współbieżności przyspiesza pracę, ale mocniej obciąża analizowaną
witrynę. W środowisku firmowym lepiej zaczynać od wartości domyślnych.

## Dane i kopie zapasowe

Bez Dockera dane trafiają do:

```text
scraped_data/<host>/<timestamp>/
```

`metadata.json` jest źródłem stanu projektu, a katalogi `pages/` przechowują
wyniki poszczególnych podstron. Usunięcie projektu z interfejsu usuwa jego dane
bez możliwości cofnięcia.

W Dockerze należy wykonywać kopię wolumenu `scrappka_data` zgodnie z polityką
backupów firmy. Sam ZIP z bazą wiedzy jest eksportem do dalszej pracy, ale nie
zastępuje kopii całego projektu.

## API — skrót dla zespołu technicznego

| Endpoint                                           | Rola                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `POST /api/app/site/map`                           | Rozpoczyna mapowanie nowego projektu.               |
| `POST /api/app/site/:host/:timestamp/map/again`    | Ponawia mapowanie i dopisuje nowe URL-e.            |
| `POST /api/app/site/:host/:timestamp/map/cancel`   | Zatrzymuje mapowanie z zachowaniem odkrytych stron. |
| `POST /api/app/site/:host/:timestamp/scrape`       | Uruchamia scrapowanie wybranych slugów.             |
| `GET /api/app/site/:host/:timestamp/stream`        | Strumień SSE ze stanem mapowania i scrapowania.     |
| `GET /api/app/site/:host/:timestamp/knowledge/zip` | Buduje i zwraca aktualną bazę wiedzy.               |
| `GET /api/app/projects`                            | Zwraca listę projektów.                             |
| `GET /api/app/projects/:host/:timestamp`           | Zwraca szczegóły projektu.                          |
| `DELETE /api/app/projects/:host/:timestamp`        | Trwale usuwa projekt.                               |
| `GET /api/health`                                  | Endpoint kontroli zdrowia aplikacji.                |

## Architektura repozytorium

| Katalog             | Odpowiedzialność                                                           |
| ------------------- | -------------------------------------------------------------------------- |
| `src/api/`          | API Hono i obsługa odpowiedzi HTTP/SSE.                                    |
| `src/scraper/`      | Bezpieczne pobieranie, mapowanie, parsowanie HTML i konwersja do Markdown. |
| `src/knowledge/`    | Czyszczenie, klasyfikacja, deduplikacja, fakty, audyt i budowa ZIP-a.      |
| `src/repositories/` | Zapis i odczyt projektów z systemu plików.                                 |
| `client/`           | Interfejs React.                                                           |
| `deploy/`           | Konfiguracja Docker Compose.                                               |

Główne technologie: Bun, TypeScript, Hono, React 19, TanStack Router/Query,
Tailwind CSS, JSDOM, Mozilla Readability i Turndown.
