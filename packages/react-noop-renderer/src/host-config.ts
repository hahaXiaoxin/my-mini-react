import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/work-tags';
import { Props } from 'shared/react-types';

/**
 * 容器类型，跟宿主环境有关
 */
export interface Container {
  rootID: number;
  children: (Instance | TextInstance)[];
}

export interface Instance {
  id: number;
  type: string;
  children: (Instance | TextInstance)[];
  parent: number;
  props: Props;
}

export interface TextInstance {
  text: string;
  id: number;
  parent: number;
}

let instanceCounter = 0;

/**
 * 创建实例
 */
export function createInstance(type: string, props: any): Instance {
  const instance = {
    id: instanceCounter++,
    type,
    children: [],
    parent: -1,
    props
  };

  return instance;
}

/**
 * 将子节点插入父节点
 */
export function appendInitialChild(parent: Instance | Container, child: Instance) {
  const prevParentID = child.parent; // id,之前 parent 的 id
  const parentID = 'rootID' in parent ? parent.rootID : parent.id;

  if (prevParentID !== -1 && prevParentID !== parentID) {
    throw new Error('不能重复挂载 Child');
  }

  child.parent = parentID;
  parent.children.push(child);
}

/**
 * 创建文本实例
 */
export function createTextInstance(content: string) {
  return {
    text: content,
    id: instanceCounter++,
    parent: -1
  };
}

// todo
export function appendChildToContainer(parent: Container, child: Instance) {
  const prevParentID = child.parent; // id,之前 parent 的 id

  if (prevParentID !== -1 && prevParentID !== parent.rootID) {
    throw new Error('不能重复挂载 Child');
  }

  child.parent = parent.rootID;
  parent.children.push(child);
}

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
  textInstance.text = content;
}

export function removeChild(child: Instance | TextInstance, container: Container) {
  const index = container.children.indexOf(child);
  if (index === -1) {
    throw new Error('child 不存在');
  }
  container.children.splice(index, 1);
}

export function insertChildToContainer(child: Instance, container: Container, before: Instance) {
  const beforeIndex = container.children.indexOf(before);
  if (beforeIndex === -1) {
    throw new Error('before 不存在');
  }
  const index = container.children.indexOf(child);

  if (index !== -1) {
    container.children.splice(index, 1);
  }

  container.children.splice(beforeIndex, 0, child);
}

/** 构造微任务 */
export const scheduleMicroTask =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : typeof Promise === 'function'
      ? (callback: (...args: any) => void) => Promise.resolve(null).then(callback)
      : setTimeout;
