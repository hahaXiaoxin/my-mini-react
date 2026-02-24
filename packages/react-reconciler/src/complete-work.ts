import { appendInitialChild, Container, createInstance, createTextInstance } from 'host-config';
import { FiberNode } from './fiber';
import { Fragment, FunctionComponent, HostComponent, HostRoot, HostText } from './work-tags';
import { NoFlags, Update } from './fiber-flags';
import { updateFiberProps } from 'react-dom/src/synthetic-event';

/** 标记表明需要更新 */
function markUpdate(fiber: FiberNode) {
  fiber.flags |= Update;
}

// 递归中的“归”
export const completeWork = (wip: FiberNode) => {
  const newProps = wip.pendingProps;
  const current = wip.alternate;

  switch (wip.tag) {
    case HostComponent:
      // 1. 构建 DOM
      if (current !== null && wip.stateNode) {
        // update
        // props 是否发生变化
        // className style
        updateFiberProps(wip.stateNode, newProps);
      } else {
        // 1. 构建 DOM
        const instance = createInstance(wip.type, newProps);
        // 2. 将 DOM 插入 DOM 树中
        appendAllChildren(instance, wip);
        wip.stateNode = instance;
      }

      bubbleProperties(wip);
      break;
    case HostText:
      // 1. 构建 DOM
      if (current !== null && wip.stateNode) {
        // update
        const oldText = current.memoizdedProps?.content;
        const newText = newProps.content;

        if (oldText !== newText) {
          markUpdate(wip);
        }
      } else {
        // 1. 构建 DOM
        const instance = createTextInstance(newProps.content);
        wip.stateNode = instance;
      }

      bubbleProperties(wip);
      break;
    case HostRoot:
    case FunctionComponent:
    case Fragment:
      bubbleProperties(wip);
      break;
    default:
      if (__DEV__) {
        console.warn('未处理的 completeWork 情况', wip);
      }
      break;
  }
};

/** 将对应的 DOM 树拼装出来 */
function appendAllChildren(parent: Container, wip: FiberNode) {
  let node = wip.child;

  while (node !== null) {
    // 只处理 HostComponent 和 HostText，
    if (node.tag === HostComponent || node.tag === HostText) {
      appendInitialChild(parent, node.stateNode);
    } else if (node.child !== null) {
      // 如果不是 Host 节点（如 FunctionComponent），向下找它的子节点
      node.child.return = node;
      node = node.child;
      continue;
    }

    if (node === wip) {
      return;
    }

    // 没有 sibling，向上回溯
    while (node.sibling === null) {
      if (node.return === null || node.return === wip) {
        return;
      }
      node = node.return;
    }

    node.sibling.return = node.return;
    node = node.sibling;
  }
}

/**
 * 将子节点的 flags 合并到父节点的 subtreeFlags 中
 */
function bubbleProperties(wip: FiberNode) {
  let subtreeFlags = NoFlags;
  let child = wip.child;

  // 这样某个节点的 subtreeFlags 就包含了所有后代节点的 flags
  while (child !== null) {
    subtreeFlags |= child.subtreeFlags;
    subtreeFlags |= child.flags;
    child.return = wip;
    child = child.sibling;
  }

  wip.subtreeFlags |= subtreeFlags;
}
