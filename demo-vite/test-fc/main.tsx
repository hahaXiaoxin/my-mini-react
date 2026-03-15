import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-noop-renderer';

function App() {
  return (
    <>
      <Child />
      <div>hello world</div>
    </>
  )
}

function Child() {
  return (
    <div>child</div>
  )
}

const root = ReactDOM.createRoot();

root.render(<App />)

window.root = root;