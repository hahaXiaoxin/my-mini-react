// ReactDOM.createRoot(document.getElementById('root')).render(<App />);

import { createContainer, updateContainer } from 'react-reconciler/src/fiber-reconciler';
import { ReactElement } from 'shared/react-types';
import { Container } from './host-config';
import { initEvent } from './synthetic-event';

export function createRoot(container: Container) {
  const root = createContainer(container);
  return {
    render(element: ReactElement) {
      initEvent(container, 'click');
      return updateContainer(element, root);
    }
  };
}
