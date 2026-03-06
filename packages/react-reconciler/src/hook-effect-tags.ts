/**
 * tag 表示当前 effect 具体属于哪一种 effect
 */

/** 表示当前要执行的是 useEffect */
export const Passive = 0b0010;

/** 用于标记本次 effect 存在副作用 */
export const HookHasEffect = 0b0001;
