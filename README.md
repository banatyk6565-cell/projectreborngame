# Project Grayfall — strona + logowanie przez Discord

Ten folder zawiera:
- `index.html` — statyczna strona (Twój dotychczasowy design, bez zmian wizualnych)
- `api/` — 3 małe funkcje serwerowe (Vercel Serverless Functions) obsługujące logowanie przez Discord
- `lib/` — pomocnicze funkcje (podpisywanie sesji, obsługa ciasteczek) — bez żadnych zewnętrznych zależności

Jak to działa w skrócie: klikasz "Panel Gracza" → strona przekierowuje Cię do Discorda → Discord pyta o zgodę →
wraca do `/api/auth/callback`, który **na serwerze** (nigdy w przeglądarce) wymienia kod na token, pobiera Twój
nick/avatar i zapisuje podpisane ciasteczko sesji. Od tej pory `/api/me` mówi stronie "jesteś zalogowany jako X".

---

## KROK 1 — Zarejestruj aplikację w Discord Developer Portal

1. Wejdź na https://discord.com/developers/applications i kliknij **New Application**.
2. Nadaj nazwę (np. "Project Grayfall") i utwórz.
3. W lewym menu wejdź w **OAuth2 → General**.
4. Skopiuj **Client ID** i **Client Secret** (kliknij "Reset Secret" jeśli trzeba go odkryć) — będą potrzebne za chwilę.
5. Niżej, w sekcji **Redirects**, kliknij "Add Redirect" i wpisz:
   ```
   https://TWOJA-DOMENA.pl/api/auth/callback
   ```
   (na razie możesz nie wiedzieć jaka będzie domena — do tego wrócimy w kroku 3, po pierwszym wdrożeniu na Vercel
   dostaniesz domenę typu `nazwa-projektu.vercel.app`, którą tu wpiszesz).
6. Zapisz zmiany (**Save Changes** na dole strony).

---

## KROK 2 — Załóż konto na Vercel i wgraj projekt

Najprościej przez GitHub:

1. Załóż darmowe konto na https://github.com (jeśli nie masz) i stwórz nowe, prywatne repozytorium,
   np. `grayfall-site`.
2. Wgraj do niego całą zawartość tego folderu (`index.html`, `api/`, `lib/`, `package.json`, obrazki).
3. Wejdź na https://vercel.com, zaloguj się przez GitHub, kliknij **Add New → Project** i wybierz to repozytorium.
4. Framework Preset zostaw jako "Other" — Vercel sam wykryje folder `api/` jako funkcje serwerowe.
5. **Zanim klikniesz Deploy**, przejdź do sekcji **Environment Variables** i dodaj:

   | Nazwa | Wartość |
   |---|---|
   | `DISCORD_CLIENT_ID` | Client ID z Discord Developer Portal |
   | `DISCORD_CLIENT_SECRET` | Client Secret z Discord Developer Portal |
   | `DISCORD_REDIRECT_URI` | `https://TWOJA-DOMENA.pl/api/auth/callback` |
   | `SESSION_SECRET` | dowolny długi losowy ciąg znaków (np. wygenerowany na https://www.random.org/strings/) |

6. Kliknij **Deploy**. Po chwili dostaniesz adres typu `https://grayfall-site.vercel.app`.

---

## KROK 3 — Dopnij adresy

1. Wróć do Discord Developer Portal → OAuth2 → Redirects i **zaktualizuj** wpis na rzeczywisty adres z Vercela,
   np. `https://grayfall-site.vercel.app/api/auth/callback`.
2. W Vercel: Settings → Environment Variables → zaktualizuj `DISCORD_REDIRECT_URI` na dokładnie ten sam adres.
3. W pliku `index.html` znajdź linię:
   ```js
   const DISCORD_CLIENT_ID = 'WSTAW_SWOJE_CLIENT_ID';
   ```
   i wklej tam swoje prawdziwe Client ID (to jest wartość publiczna, może bezpiecznie być w kodzie front-endu).
4. Zacommituj i wypchnij zmianę na GitHub — Vercel automatycznie zrobi nowy deploy.
5. Jeśli później podepniesz własną domenę (np. `grayfall.pl`) w Vercelu, powtórz kroki 1–2 z nową domeną.

---

## KROK 4 — Przetestuj

1. Wejdź na swoją stronę, kliknij **Panel Gracza**.
2. Powinieneś zostać przekierowany do Discorda z prośbą o zgodę na "identify" (podstawowe dane: nick + avatar).
3. Po zaakceptowaniu wracasz na stronę, a przycisk w navbarze pokazuje Twój avatar i nick.
4. Kliknięcie w przycisk teraz otwiera panel (zamiast przekierowywać do logowania), w panelu widać "Zalogowano jako
   [Twój nick]" oraz przycisk **Wyloguj się**.

---

## Co dalej (kolejny etap, nie teraz)

To jest wersja "prosta": logowanie + nick/avatar. Naturalny następny krok to **sprawdzanie, czy dana osoba
jest na serwerze Discord / ma odpowiednią rolę** (np. czy jest wybielona) — wymaga to:
- rozszerzenia `scope` o `guilds` lub `guilds.members.read` przy budowaniu linku logowania,
- dodatkowego zapytania do Discord API (`/users/@me/guilds/{guild.id}/member`) w `api/auth/callback.js`,
- zapisania roli/statusu w sesji, żeby np. odblokować sekcję "Zgłoś się na Whitelistę".

Daj znać, kiedy będziesz gotowy na ten krok — dobudujemy to na tym samym fundamencie.

## Bezpieczeństwo — o co chodzi z tymi zmiennymi środowiskowymi

`DISCORD_CLIENT_SECRET` i `SESSION_SECRET` **nigdy** nie powinny trafić do kodu front-endowego (HTML/JS
wysyłanego do przeglądarki) ani do publicznego repozytorium GitHub. Dlatego żyją tylko jako zmienne środowiskowe
w panelu Vercel i są używane wyłącznie wewnątrz plików w `api/` (kod działający na serwerze, niewidoczny dla
odwiedzających). Plik `.env.example` to tylko szablon pokazujący, jakich zmiennych potrzebujesz — nie wrzucaj do
repo prawdziwego pliku `.env` z sekretami.
