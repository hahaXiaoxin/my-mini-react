import path from 'path';
import fs from 'fs';

import cjs from '@rollup/plugin-commonjs';
import ts from '@rollup/plugin-typescript';

const pkgPath = path.resolve(__dirname, '../../packages');
const distPath = path.resolve(__dirname, '../../dist/node_modules');

/**
 * 获取包所在的路径
 * @param pkgName 包名
 * @param isDist 是否是 dist
 * @returns string
 */
export function resolvePkgPath(pkgName, isDist = false) {
  if (isDist) {
    return `${distPath}/${pkgName}`;
  }

  return `${pkgPath}/${pkgName}`;
}

/**
 * 获取对应包名称的 package.json 信息
 * @param pkgName 包名
 * @returns
 */
export function getPackageJSON(pkgName) {
  const path = `${resolvePkgPath(pkgName, false)}/package.json`;
  const str = fs.readFileSync(path, { encoding: 'utf-8' });
  return JSON.parse(str);
}

/**
 * 获取基础插件
 * @param options 插件参数
 * @param options.typescriptOptions rollup-plugin-typescript 插件参数
 * @returns
 */
export function getBaseRollupPlugins(options){
  const { typescriptOptions } = options || {};
  return [cjs(), ts(typescriptOptions)];
}
