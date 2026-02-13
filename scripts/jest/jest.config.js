import { defaults } from 'jest-config';

export default {
  ...defaults,
  rootDir: process.cwd(),
  modulePathIgnorePatterns: ['<rootDir>/.history'],
  // 使用某个包时从哪个路径下开始找，优先级
  moduleDirectories: [
    // 对于 React ReactDOM
    'dist/node_modules',
    // 对于第三方依赖
    ...defaults.moduleDirectories
  ],
  testEnvironment: 'jsdom'
};
