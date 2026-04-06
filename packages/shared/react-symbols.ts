/**
 * 当前环境是否支持 symbol
 */
const supportSymbol = typeof Symbol === 'function' && Symbol.for;

/**
 * 用于标记某个对象为 ReactElement
 */
export const REACT_ELEMENT_TYPE = supportSymbol ? Symbol.for('react.element') : 0xeac7;

/**
 * 用于标记某个对象为 ReactFragment
 */
export const REACT_FRAGMENT_TYPE = supportSymbol ? Symbol.for('react.fragment') : 0xeacb;

/**
 * 用于标记某个对象为 ReactContext
 */
export const REACT_CONTEXT_TYPE = supportSymbol ? Symbol.for('react.context') : 0xeacc;

/**
 * 用于标记某个对象为 ReactProvider
 */
export const REACT_PROVIDER_TYPE = supportSymbol ? Symbol.for('react.provider') : 0xeac2;

/**
 * 用于标记某个对象为 ReactProvider
 */
export const REACT_SUSPENSE_TYPE = supportSymbol ? Symbol.for('react.suspense') : 0xeac3;

/**
 * 用于标记某个对象为 ReactMemo
 */
export const REACT_MEMO_TYPE = supportSymbol ? Symbol.for('react.memo') : 0xeac4;
