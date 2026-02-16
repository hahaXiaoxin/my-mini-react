import React, { useState } from 'react';
import ReactDOM from 'react-dom';

const Child = () => {
  return <div>
    <span>mini-react</span>
  </div>;
};

const App = () => {
  const [value, setValue] = useState(1);
  return (
    <div>
      {/* <Child /> */}
      <div onClick={() => {setValue(value + 1)}}>{value}</div>
    </div>
  );
};

const root = document.querySelector('#root');

ReactDOM.createRoot(root!).render(<App />);

console.log(React);
console.log(ReactDOM);
console.log(ReactDOM.createRoot);
