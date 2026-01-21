/**
 * 容器类型，跟宿主环境有关
 * 例如：
 * - web: DomElement
 */
export type Container = Element;

export type Instance = Element;

/**
 * 创建实例
 */
export function createInstance(type: string, props: any): Instance {
  // todo 处理 props
  const element = document.createElement(type);
  return element;
}

/**
 * 将子节点插入父节点
 */
export function appendInitialChild(parent: Instance | Container, child: Instance) {
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
