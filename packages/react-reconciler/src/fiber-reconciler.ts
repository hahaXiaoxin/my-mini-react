import { Container } from 'host-config';
import { HostRoot } from './work-tags';
import { FiberNode, FiberRootNode } from './fiber';
import { createUpdate, createUpdateQueue, enqueueUpdate, UpdateQueue } from './update-queue';
import { ReactElement } from 'shared/react-types';
import { scheduleUpdateOnFiber } from './work-loop';

/** 创建整个应用的根节点 */
export function createContainer(container: Container) {
  const hostRootFiber = new FiberNode(HostRoot, {}, null);
  const root = new FiberRootNode(container, hostRootFiber);

  hostRootFiber.updateQueue = createUpdateQueue();
  return root;
}

/** 更新容器，首屏渲染的时候，让 root 的渲染逻辑也走 updateQueue */
export function updateContainer(element: ReactElement | null, root: FiberRootNode) {
  const hostRootFiber = root.current;
  const update = createUpdate<ReactElement | null>(element);

  /** 将 Update 入队 */
  enqueueUpdate(hostRootFiber.updateQueue as UpdateQueue<ReactElement | null>, update);
  scheduleUpdateOnFiber(hostRootFiber);
  return;
}
