# Max Open – turnajová microsite (React + Vite + Tailwind)

Jednoduchá webová aplikace pro rozpis, zadávání výsledků a tabulky. Funguje čistě na frontendu (localStorage + export/import JSON).

## Nasazení na GitHub Pages (kroky)

1) **Vytvoř repozitář** na GitHubu (např. `max-open-microsite`).  
2) Stáhni ZIP z této konverzace, rozbal a obsah nahraj do repa (nebo `git init`, `git add .`, `git commit -m "init"`, `git branch -M main`, `git remote add origin ...`, `git push -u origin main`).  
3) V souboru `vite.config.js` nastav `base` na `/<název-repa>/` – příklad:  
   ```js
   export default defineConfig({
     plugins: [react()],
     base: '/max-open-microsite/'
   })
   ```
4) Na GitHubu otevři **Settings → Pages** a jako **Source** nastav „GitHub Actions“.  
5) V repu je připravený workflow `.github/workflows/deploy.yml`. Po pushi na `main` proběhne build a deploy.  
6) Finální URL bude `https://<tvoje-uzivatelske-jmeno>.github.io/<název-repa>/`.

## Lokální vývoj

```bash
npm install
npm run dev
# otevři http://localhost:5173
```

## Funkce
- Rozpis „každý s každým“ pro Skupinu A a B (bez zápasů s VOLNO).
- Zadávání výsledků + tabulky (W/L, GF/GA, GD) se živým přepočtem a seřazením.
- Playoff (4 postupují z každé skupiny) – párování ČF1–ČF4.
- Export / import dat do JSON (ruční sdílení stavu).

> Pozn.: Pokud chceš **živou synchronizaci**, přidej třeba Firebase/Supabase – rád doplním kód.
