import { parseInfoText } from '@/lib/text';

/** Affiche le texte de l'ortho en blocs React : aucun HTML n'est interprété. */
export function InfoText({ source }: { source: string }) {
  return (
    <div className="info-text">
      {parseInfoText(source).map((block, i) => {
        switch (block.kind) {
          case 'title':
            return <h2 key={i}>{block.text}</h2>;
          case 'heading':
            return <h3 key={i}>{block.text}</h3>;
          case 'paragraph':
            return <p key={i}>{block.text}</p>;
          case 'list':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
}
