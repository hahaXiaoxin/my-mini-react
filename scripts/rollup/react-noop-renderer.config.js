import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';
import alias from '@rollup/plugin-alias';

const { name, module, main, peerDependencies } = getPackageJSON('react-noop-renderer');
// react-noop-renderer 包的路径
const pkgPath = resolvePkgPath(name, false);
// react-noop-renderer 产物路径
const pkgDistPath = resolvePkgPath(name, true);

const entry = module || main || 'index.ts';

export default [
  // react-noop-renderer
  {
    input: `${pkgPath}/${entry}`,
    output: [
      {
        file: `${pkgDistPath}/index.js`,
        name: 'ReactNoopRenderer',
        format: 'umd'
      }
    ],
    external: [...Object.keys(peerDependencies), 'scheduler'],
    plugins: [
      ...getBaseRollupPlugins({
        typescript: {
          tsconfigOverride: {
            compilerOptions: {
              paths: {
                'host-config': ['./react-noop-renderer/src/host-config.ts']
              }
            }
          }
        }
      }),
      alias({
        entries: {
          'host-config': `${pkgPath}/src/host-config.ts`
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
