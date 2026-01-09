import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';

const { name, module, main } = getPackageJSON('react');
// react 包的路径
const pkgPath = resolvePkgPath(name, false);
// react 产物路径
const pkgDistPath = resolvePkgPath(name, true);

const entry = module || main || 'index.ts';

export default [
  // react
  {
    input: `${pkgPath}/${entry}`,
    output: {
      file: `${pkgDistPath}/index.js`,
      name: 'index.js',
      format: 'umd'
    },
    plugins: [
      ...getBaseRollupPlugins(),
      generatePackageJson({
        inputFolder: pkgPath,
        outputFolder: pkgDistPath,
        baseContents: ({ name, description, version }) => {
          return {
            name,
            description,
            version,
            main: 'index.js' // 为什么用 main 而不是 module，因为 umd 格式是通用的，直接用 main 即可
          };
        }
      })
    ]
  },
  // jsx-runtime
  {
    input: `${pkgPath}/src/jsx.ts`,
    output: [
      // jsx-runtime
      {
        file: `${pkgDistPath}/jsx-runtime.js`,
        name: 'jsx-runtime.js',
        format: 'umd'
      },
      // jsx-dev-runtime
      {
        file: `${pkgDistPath}/jsx-dev-runtime.js`,
        name: 'jsx-dev-runtime.js',
        format: 'umd'
      }
    ],
    plugins: getBaseRollupPlugins()
  }
];
