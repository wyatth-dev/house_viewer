/** 小型 DOM 工具：创建元素并设置属性 / 子节点。 */
export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
    ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
}
