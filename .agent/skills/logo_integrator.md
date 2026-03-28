# SKILL : React SVG Logo Integrator

## Contexte
Cette compétence permet de rechercher, nettoyer et intégrer des logos constructeurs au format SVG dans une application React (fichier `src/components/StreamTree.tsx`).

## Outils Requis (MCP)
- Recherche Web (`web-search` ou équivalent)
- Scraping Web (`puppeteer` et `fetch`)

## Workflow Étape par Étape
1. **Recherche** : Utilise la recherche web avec la requête `"[Nom du constructeur] logo SVG wikimedia commons"`.
2. **Navigation** : Trouve le lien direct vers le fichier original (`Original file` sur Wikimedia, terminant par `.svg`).
3. **Extraction** : Télécharge le code brut du fichier SVG.
4. **Nettoyage (CRITIQUE)** :
   - Conserve uniquement la balise `<svg>` et les tracés internes (`<path>`, `<polygon>`, `<rect>`, `<circle>`).
   - Supprime TOUTES les métadonnées (`<metadata>`, `<defs>`, `<style>`, `<title>`, `<desc>`).
   - Supprime TOUS les attributs de couleur codés en dur (ex: `fill="#000"`, `style="fill: red"`).
5. **Conversion JSX** :
   - Transforme tous les attributs kebab-case en camelCase (ex: `fill-rule` devient `fillRule`).
   - Modifie la balise racine pour qu'elle soit STRICTEMENT : `<svg viewBox="[valeurs originales]" fill="currentColor" className="h-full w-auto">`.
6. **Intégration** :
   - Ajoute le code JSX généré dans l'objet `manufacturerLogos` du fichier `src/components/StreamTree.tsx`.

## Fallback
Si aucun SVG propre n'est trouvé après 2 requêtes de recherche, ignore ce constructeur et passe au suivant. Rédige un rapport des échecs à la fin.