import React, { useState } from 'react';
import ReactDOM from 'react-dom';

const Child = () => {
  const [value] = useState(123);

  return (
    <div>
      <span>{value}</span>
    </div>
  );
};

const a = () => {
  return (
    <div>
      <Child />
    </div>
  );
};

const root = document.querySelector('#root');

ReactDOM.createRoot(root).render(a);

console.log(React, a);
console.log(ReactDOM);
console.log(ReactDOM.createRoot);
