import React, { useState } from 'react';
import ReactDOM from 'react-dom';

const Child = () => {
  return <div>
    <span>mini-react</span>
  </div>;
};

const App = () => {
  const [value, setValue] = useState(1);
  const arr = value % 2 === 0 ? [
    <li key={1}>1</li>,
    <li key={2}>2</li>,
    <li key={3}>3</li>,
  ] : [
    <li key={3}>3</li>,
    <li key={2}>2</li>,
    <li key={1}>1</li>,
  ];
  return (
    <div>

      <ul onClick={() => { setValue(value + 1) }}>
        <li>4</li>
        <li>5</li>
        {arr}
      </ul>
    </div>
  );
};

const root = document.querySelector('#root');

ReactDOM.createRoot(root!).render(<App />);

console.log(React);
console.log(ReactDOM);
console.log(ReactDOM.createRoot);
