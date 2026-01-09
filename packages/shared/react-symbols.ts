/**
 * 当前环境是否支持 symbol
 */
const supportSymbol = typeof Symbol === 'function' && Symbol.for;

/**
 * 用于标记某个对象为 ReactElement
 */
export const REACT_ELEMENT_TYPE = supportSymbol ? Symbol.for('react.element') : 0xeac7;
