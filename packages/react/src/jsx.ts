import { REACT_ELEMENT_TYPE } from 'shared/react-symbols';
import type { Type, Key, Ref, Props, ReactElement, ElementType } from 'shared/react-types';

function ReactElement(type: Type, key: Key, ref: Ref, props: Props): ReactElement {
  const element = {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key,
    ref,
    props,
    __mark: 'xiaoxin'
  };

  return element;
}

/**
 * 将 jsx 解析后返回一个 ReactElement
 * @param type 组件类型
 * @param config 一些属性
 * @param maybeChildren 子元素
 * @returns
 */
export function jsx(type: ElementType, config: any, ...maybeChildren: any[]): ReactElement {
  let key: Key = null;
  const props: Props = {};
  let ref: Ref = null;

  for (const prop in config) {
    const val = config[prop];

    // 处理公共的 prop，提供给 react 框架的
    if (prop === 'key') {
      if (val !== undefined) {
        key = '' + val;
      }
      continue;
    }

    if (prop === 'ref') {
      if (val !== undefined) {
        ref = val;
      }
      continue;
    }

    // 处理组件的 prop
    if (Object.prototype.hasOwnProperty.call(config, prop)) {
      props[prop] = val;
    }
  }

  const maybeChildrenLength = maybeChildren.length;

  if (maybeChildrenLength) {
    // 只有一个元素和有多个元素的情况要区分对待 child [child, child, child]
    if (maybeChildrenLength === 1) {
      props.children = maybeChildren[0];
    } else {
      props.children = maybeChildren;
    }
  }

  return ReactElement(type, key, ref, props);
}

/**
 * jsxDEV 是 jsx 的开发版本
 * @param type 组件类型
 * @param config 一些属性
 * @param maybeChildren 子元素
 * @returns
 */
export function jsxDEV(type: ElementType, config: any): ReactElement {
  let key: Key = null;
  const props: Props = {};
  let ref: Ref = null;

  for (const prop in config) {
    const val = config[prop];

    // 处理公共的 prop，提供给 react 框架的
    if (prop === 'key') {
      if (val !== undefined) {
        key = '' + val;
      }
      continue;
    }

    if (prop === 'ref') {
      if (val !== undefined) {
        ref = val;
      }
      continue;
    }

    // 处理组件的 prop
    if (Object.prototype.hasOwnProperty.call(config, prop)) {
      props[prop] = val;
    }
  }

  return ReactElement(type, key, ref, props);
}
