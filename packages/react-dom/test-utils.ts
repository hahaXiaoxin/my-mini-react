import { ReactElement } from 'shared/react-types';
import { createRoot } from 'react-dom';

export function renderIntoDocument(element: ReactElement) {
  const div = document.createElement('div');
  return createRoot(div).render(element);
}
