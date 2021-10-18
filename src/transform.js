import { transformSync, build } from 'esbuild';
import { extname, dirname, join } from 'path'
import { existsSync } from 'fs'


// 缓存 编译的 node_modules 模块，防止多次编译
let nodeModulesMap = new Map();

const appRoot = join(__dirname, '..')
const cache = join(appRoot, 'target', `.cache/`);

/**
 * 
 * @param {Object} opts 编译配置对象
 * @returns Object .code 为编译之后的代码
 */
export const transformCode = opts => {
    return transformSync(opts.code, {
        loader: opts.loader || 'js',
        sourcemap: true,
        format: 'esm'
    })
}

/**
 * 
 * @param {Array}} pkgs 要编译的node_modules模块集合
 */
const buildNodeModule = async pkgs => {
    const ep = pkgs.reduce((c, n) => {
        c.push(join(appRoot, "node_modules", n, `index.js`));
        return c;
    }, []);

    // console.log(111, ep);

    await build({
        entryPoints: ep,
        bundle: true,
        format: 'esm',
        logLevel: 'error',
        splitting: true,
        sourcemap: true,
        outdir: cache,
        treeShaking: 'ignore-annotations',
        metafile: true,
        define: {
            "process.env.NODE_ENV": JSON.stringify("development") // 默认开发模式
        }
    })
}

// 转换 js、jsx代码为 esm 模块
export const transformJSX = async opts => {
    const ext = extname(opts.path).slice(1); // 'jsx'
    const ret = transformCode({ // jsx -> js
        loader: ext,
        code: opts.code
    });

    let { code } = ret;

    // 用于保存需要编译的node_module 模块
    let needbuildModule = [];

    /**
     * 寻找文件内容字符串里面的 import 
     * 分析出本地文件、node_modules 模块
     * import React from 'react';
     * 下面的正则取出 from 后面的 "react", 然后通过有没有 "." 判断是引用的本地文件还是三方库
     */
    code = code.replace(
        /\bimport(?!\s+type)(?:[\w*{}\n\r\t, ]+from\s*)?\s*("([^"]+)"|'([^']+)')/gm,
        (a, b, c) => {
            let from;
            if (c.charAt(0) === '.') { // 本地文件
                from = join(dirname(opts.path), c);
                const filePath = join(opts.appRoot, from);
                if (!existsSync(filePath)) {
                    if (existsSync(`${filePath}.js`)) {
                        from = `${from}.js`
                    }
                }

                if (['svg'].includes(extname(from).slice(1))) {
                    from = `${from}?import`
                }
            }
            else { // 从 node_modules 里来的
                from = `/target/.cache/${c}/index.js`;
                if (!nodeModulesMap.get(c)) {
                    needbuildModule.push(c);
                    nodeModulesMap.set(c, true)
                }
            }


            return a.replace(b, `"${from}"`)
        }
    )

    // 如果有需要编译的第三方模块
    if(needbuildModule.length) {
        await buildNodeModule(needbuildModule);
    }
    return {
        ...ret,
        code
    }
}

// 拼接一个可以自动添加style 到 head 的代码块
export const transformCss = opts => {
    return `
    var insertStyle = function(content) {
        let style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.innerHTML = content;
        document.head.appendChild(style);
    }
    const css = "${opts.code.replace(/\n/g, '')}";
    insertStyle(css);
    insertStyle = null;
    export default css;
    `
}

