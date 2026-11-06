/**
 * Mise en forme minimale des textes saisis par l'ortho, sans jamais injecter
 * de HTML : on produit des blocs que React affiche comme du texte.
 *   « ## » en début de ligne = titre, « * » = puce, ligne vide = paragraphe.
 */
export type TextBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

export function parseInfoText(source: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push({ kind: 'list', items: list });
    list = [];
  };

  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return flush();
    if (line.startsWith('* ') || line.startsWith('- ')) {
      list.push(line.slice(2).trim());
      return;
    }
    flush();
    if (line.startsWith('## ')) blocks.push({ kind: 'heading', text: line.slice(3).trim() });
    else if (index === 0) blocks.push({ kind: 'title', text: line });
    else blocks.push({ kind: 'paragraph', text: line });
  });
  flush();
  return blocks;
}

/** Remplace les champs {aidant}, {patient}, {lien}, {orthophoniste}, {cabinet}. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z]+)\}/g, (match, key: string) => values[key] ?? match);
}
