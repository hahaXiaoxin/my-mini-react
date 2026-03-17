import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

function App() {
  const [num, update] = useState(100);
  return (
    <ul onClick={() => update(50)}>
      {new Array(num).fill(0).map((_, i) => <Child key={i}>Child {i}</Child>)}
    </ul>
  )
}

function Child({ children }) {
  const now = performance.now();
  while (performance.now() - now < 4) { }

  return <li>{children}</li>
}

const root = ReactDOM.createRoot(document.querySelector('#root'));

root.render(<App />)

window.root = root;