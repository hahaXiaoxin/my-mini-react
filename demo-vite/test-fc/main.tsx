import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

// const Child = () => {
//   return <div>
//     <span>mini-react</span>
//   </div>;
// };

// const App = () => {
//   const [value, setValue] = useState(1);
//   const arr = value % 2 === 0 ? [
//     <li key={1}>1</li>,
//     <li key={2}>2</li>,
//     <li key={3}>3</li>,
//   ] : [
//     <li key={3}>3</li>,
//     <li key={2}>2</li>,
//     <li key={1}>1</li>,
//   ];
//   return (
//     <div>

//       <ul onClick={() => {
//         setValue(num => num + 1);
//         setValue(num => num + 1);
//         setValue(num => num + 1);
//       }}>
//         {value}
//       </ul>
//     </div>
//   );
// };

function App() {
  const [num, updateNum] = useState(0);
  useEffect(() => {
    console.log('App mount');
  }, []);

  useEffect(() => {
    console.log('num change create', num);
    return () => {
      console.log('num change destroy', num);
    };
  }, [num]);

  return (
    <div onClick={() => updateNum(num + 1)}>
      {num === 0 ? <Child /> : 'noop'}
    </div>
  );
}

function Child() {
  useEffect(() => {
    console.log('Child mount');
    return () => console.log('Child unmount');
  }, []);

  return 'i am child';
}

const root = document.querySelector('#root');

ReactDOM.createRoot(root!).render(<App />);

console.log(React);
console.log(ReactDOM);
console.log(ReactDOM.createRoot);
