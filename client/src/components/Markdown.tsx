import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ANCHOR: les liens externes s'ouvrent dans un nouvel onglet, le HTML brut reste désactivé par défaut
const composants = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

export default function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={composants as any}>
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
