import React, { useState } from 'react';
import ReactDOM from 'react-dom';

const Child = () => {
  return <div>
    <span>mini-react</span>
  </div>;
};

const App = () => {
  return (
    <div>
      <Child />
    </div>
  );
};

const root = document.querySelector('#root');

ReactDOM.createRoot(root!).render(<App />);

console.log(React);
console.log(ReactDOM);
console.log(ReactDOM.createRoot);
