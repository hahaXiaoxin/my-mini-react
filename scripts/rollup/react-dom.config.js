import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';
import alias from '@rollup/plugin-alias';

const { name, module, main } = getPackageJSON('react-dom');
// react-dom 包的路径
const pkgPath = resolvePkgPath(name, false);
// react-dom 产物路径
const pkgDistPath = resolvePkgPath(name, true);

const entry = module || main || 'index.ts';

export default [
  // react-dom
  {
    input: `${pkgPath}/${entry}`,
    // 为了兼容 17 和 18 的差异
    // 18 import ReactDOM from 'react-dom/client.js'
    // 17 import ReactDOM from 'react-dom'
    external: ['react-dom/client'],
    output: [
      // react17
      {
        file: `${pkgDistPath}/index.js`,
        name: 'index.js',
        format: 'umd'
      },
      // react18
      {
        file: `${pkgDistPath}/client.js`,
        name: 'client.js',
        format: 'umd'
      }
    ],
    plugins: [
      ...getBaseRollupPlugins(),
      alias({
        entries: {
          hostConfig: `${pkgPath}/src/hostConfig.ts`
        }
      }),
      generatePackageJson({
        inputFolder: pkgPath,
        outputFolder: pkgDistPath,
        baseContents: ({ name, description, version }) => {
          return {
            name,
            description,
            version,
            peerDependencies: {
              react: version
            },
            main: 'index.js' // 为什么用 main 而不是 module，因为 umd 格式是通用的，直接用 main 即可
          };
        }
      })
    ]
  }
];
