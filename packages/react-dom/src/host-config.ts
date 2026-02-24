import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/work-tags';
import { DOMElement, updateFiberProps } from './synthetic-event';

/**
 * 容器类型，跟宿主环境有关
 * 例如：
 * - web: DomElement
 */
export type Container = Element;

export type Instance = Element;

export type TextInstance = Text;

/**
 * 创建实例
 */
export function createInstance(type: string, props: any): Instance {
  // todo 处理 props
  const element = document.createElement(type) as unknown;
  updateFiberProps(element as DOMElement, props);
  return element as DOMElement;
}

/**
 * 将子节点插入父节点
 */
export function appendInitialChild(parent: Instance | Container, child: Instance) {
  if (__DEV__) {
    console.warn('[appendInitialChild] 插入子节点', child, '到父节点', parent);
  }
  parent.appendChild(child);
}

/**
 * 创建文本实例
 */
export function createTextInstance(content: string) {
  return document.createTextNode(content);
}

// todo
export const appendChildToContainer = appendInitialChild;

/** commit 阶段处理 Update 相关逻辑 */
export function commitUpdate(fiber: FiberNode) {
  switch (fiber.tag) {
    case HostText: {
      const text = fiber.memoizdedProps.content;
      return commitTextUpdate(fiber.stateNode, text);
    }
    default:
      if (__DEV__) {
        console.warn('未处理的 Update 类型', fiber);
      }
      break;
  }
}

export function commitTextUpdate(textInstance: TextInstance, content: string) {
  textInstance.textContent = content;
}

export function removeChild(child: Instance | TextInstance, container: Container) {
  container.removeChild(child);
}

export function insertChildToContainer(child: Instance, container: Container, before: Instance) {
  container.insertBefore(child, before);
}
