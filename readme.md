# 目标 实现一个简单的vite
假如我们有一个 `target` 文件夹，文件结构如下

``` text
    target
    ├── App.css
    ├── App.jsx
    ├── index.css
    ├── index.html
    ├── index.jsx
    ├── logo.svg
```
```js
    // index.html 关键代码
    <script type="module" src="/target/index.jsx"></script>

    // 在 index.jsx 中，其实就是标准的 `react` 语法 的入口文件，代码如下
    import React from 'react';
    import ReactDOM from 'react-dom';
    import './index.css';
    import App from './App.jsx';

    ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById('root')
    );
```

下面，我们要让这个文件，在不借助我们熟悉的 `webpack` 或者其他cli 工具的情况下，使用 `vite` 的核心思想，让它在浏览器中正常运行起来。

# 一步一步实现一个简单的vite开发版

这里会用到几个node模块，可以现在package.json里面预先写好，然后npm install 安装

```js
    {
        // ...
        "devDependencies": {
            "esno": "^0.5.0",
            "express": "^4.17.1",
            "react": "^17.0.0",
            "react-dom": "^17.0.0",
            "ws": "^7.4.5"
        },
        "dependencies": {
            "chokidar": "^3.5.2"
        }
    }
```

## 1、搭建一个http服务，返回我们的入口文件 `index.html`

在 `target` 同级，新建一个 `src` 目录，同时 在 `src` 下新建一个 `dev.js`

``` js
    // dev.js

    import express from "express";
    import { createServer } from "http";
    import { join } from 'path'; // 文件路径相关操作api
    import { readFileSync } from "fs"; // 文件读取相关操作api

    // target 文件夹的绝对路径
    const targetRootPath = join(__dirname, '../target'); 

    export async function dev() {
        const app = express();
        // 拦截请求根路径，返回index.html文件内容
        app.get('/', (req, res) => {
            // 读取index.html文件
            const htmlPath = join(targetRootPath, 'index.html');
            let html = readFileSync(htmlPath, 'utf-8');
            // 设置 返回的内容类型为 text/html
            res.set('Content-Type', 'text/html');
            // 返回index.html文件的字符串
            res.send(html);
        });

        // 创建server服务器
        const server = createServer(app);
        const port = 9001;
        // 监听端口
        server.listen(port, () => {
            console.log('App is running at http://127.0.0.1:' + port)
        });
    }
```

在新建一个 `dev.command.js`，用于引入 `dev.js` 并执行 `dev()` 方法

```js
    // dev.commamd.js
    import { dev } from './dev';

    dev().catch(console.error);
```

在 `package.json` 里面 新建一个 `dev` 脚本命令，使用 [`esno`](https://www.npmjs.com/package/esno) 模块执行 `es` 语法的文件

```js
    // package.json
    {
        // ...
        "scripts": {
            "dev": "esno src/dev.command.js"
        },
    }
```

在终端里面，运行 `npm run dev` 命令，在 浏览器中打开 `http://127.0.0.1:9001/`，检查 `Network` 面板，可以发现 `index.html` 文件的内容，已经正常返回，但是页面还是空白的。

## 2、处理静态资源

在上一步，`index.html` 已经被正常解析并返回，但发现其引入的 `index.jsx` 资源 `404`

  >这里约定，静态资源路径，都以 `/target` 开头，那么就可以在路由中统一处理

### 2.1 处理脚本文件（js、jsx）
```js
    // 这里会用到 esbuild ，将各种类型的js文件转换为浏览器可识别的 esm 格式

    // dev.js
    // ...
    import { transformSync } from 'esbuild'; // 构建代码


    const transformCode = opts => {
        return transformSync(opts.code, {
            loader: opts.loader || 'js',
            sourcemap: true,
            format: 'esm'
        })
    }

    const transformJSX = opts => {
        const ext = extname(opts.path).slice(1); // 'jsx'
        const ret = transformCode({ // jsx -> js
            loader: ext,
            code: opts.code
        });

        let { code } = ret;

        return {
            code
        }
    }

    // target 文件夹的绝对路径
    const targetRootPath = join(__dirname, '../target'); 

    export async function dev() {
        // ...

        // 拦截 静态资源路径，并返回相应的 浏览器 可以识别的 资源
        app.get('/target/*', (req, res) => {

            // req.path -----> /target/index.jsx
            // 完整的文件路径
            const filePath = join(__dirname, '..', req.path.slice(1));

            // 这里要区别不同文件的处理，先处理 jsx 文件 一个一个来
            switch (extname(req.path)) {
                case '.jsx': {
                    res.set('Content-Type', 'application/javascript');
                    // 这里封装一个 jsx 文件 转换为 js文件的方法，因为浏览器其实不能解析jsx文件的
                    res.send(
                        transformJSX({
                            appRoot: targetRootPath,
                            path: req.path,
                            code: readFileSync(filePath, 'utf-8')
                        }).code
                    )
                    break;
                }
                default:
                    break;
            }
        })

        // ...
    }

```
到这里，我们可以在 `Nextwork` 面板中看到 `index.jsx` 已经正常返回了，但是 `jsx` 文件里面依然有 `import`，其中又分为引入 `node_modules` 和 `本地` 文件，我们做如下处理：

1、将引入的本地资源，拼接 `/target` 前缀，统一它的静态资源路径

2、将引入的 `node_modules` 模块，拼接 `/target/.cache/${moduleName}/index.js` 前缀，并将相应模块处于node_modules里面的文件，编译转换为 `esm` 模块，存放于 `/target/.cache/${moduleName}` 下；编译模块采用 [`esbuild`](https://github.com/evanw/esbuild)，性能更快

这里抽取一个 `transform.js` 文件，用于处理文件编译、转换操作

```js
    // transform.js

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
```
### 2.2 处理其他静态资源文件
到上一步为止，重启 `npm run dev` 命令之后，应该可以发现浏览器已经能够正常解析大部分文件，并且，页面应该可以正常显示出来。检查 `Network` 面板，发现还有 `css`、`svg` 文件没有正常处理。在静态资源处理函数中，继续添加条件

```js
    // dev.js
    import { transformCss, transformJSX } from './transform';

    // ...

    // 拦截 静态资源路径，并返回相应的 浏览器 可以识别的 资源
    app.get('/target/*', async (req, res) => {

        // ...

        // 这里要区别不同文件的处理
        switch (extname(req.path)) {
            
            // ...

            case '.svg':
                // svg 文件其实浏览器是可以识别的
                res.set('Content-Type', 'image/svg+xml');
                res.send(
                    readFileSync(filePath, 'utf-8')
                )
                break;
            case ".css":
                // css文件，封装一个 transformCss 方法，返回类型为脚本
                res.set('Content-Type', 'application/javascript');
                res.send(
                    transformCss({
                        path: req.path,
                        code: readFileSync(filePath, 'utf-8')
                    })
                )
                res.send()
                break;
            default:
                break;
        }
    })

    // transform.js

    // ...

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

```
这里可能还会涉及到其他类型的文件，比如 `png` 、`json` 以及 `less` 等等系列的文件，都可以按照此方法处理后，返回相应的资源就可以，不再举例；

到此，重启 `npm run dev` 命令之后，页面应该是正常显示，并且可以正常运行了

## 3、热更新

在开发过程中，热更新可能是开发工程师必不可少的一个功能，现在来实现一个简单的热更新

`思考`：热更新的过程是啥样的？

   > 修改代码 -> 页面自动刷新

`再细化一点`：

   > 修改代码 -> Node发现 xxx 文件变化了 -> 通知浏览器 xxx 文件改变了 -> 浏览器接受到消息 -> 浏览器重新请求 xxx 文件 -> 页面自动刷新

基于上面这个流程，很容易想到：

   >1、node 程序需要能够监听文件的变化

   >2、node 程序需要能够发送消息给目标浏览器

   >3、浏览器 需要能够接受消息

   >4、浏览器 需要能够拉取变更之后的文件，并执行相应刷新操作

所以，这里使用 [`chokidar`](https://www.npmjs.com/package/chokidar) 来监听文件变化，浏览器端使用 [`WebSocket`](https://developer.mozilla.org/zh-CN/docs/Web/API/WebSocket) 接受消息，Node进程使用 [`ws`](https://www.npmjs.com/package/ws) 模块与浏览器通信

这里还有一个问题，如何将 `WebSocket` 代码嵌入浏览器中？

在之前的流程中，我们是将 `index.html` 通过 Node 模块读取后，返回给浏览器的，那么可以在这里将读取到的文件内容，塞入一个script标签，在里面写好相应的内嵌代码，不就解决了～

为了优雅一点，我们可以塞入一个 `esm` 模块，然后拦截对应请求，返回相应的代码

### 首先，我们新建一个 `client.js` 用于浏览器 的 webSockte 相关代码

本次的文件刷新，采用了简单粗暴的 `location.reload()` 方法，对用 `vue` 和 `react`，其实有很多其他方法，局部刷新然后 rerender 。比如 [`react-hot-loader`](https://github.com/gaearon/react-hot-loader)等

```js
    // client.js

    console.log('[vite] is connecting....');

    const host = location.host;

    // 客户端 - 服务端建立一个通信
    const socket = new WebSocket(`ws://${host}`, 'vite-hmr');

    // 监听通信，拿数据，然后做处理
    socket.addEventListener('message', async ({ data }) => {
        handleMessage(JSON.parse(data)).catch(console.error);
    })

    async function handleMessage(payload) {
        switch (payload.type) {
            case 'connected':
                console.log('[vite] connected.');

                setInterval(() => socket.send('ping'), 30000);
                break;
            case 'update':
                payload.updates.forEach(async (update) => {
                    if (update.type === 'js-update') {
                        console.log('[vite] js update....');
                        await import(`/target/${update.path}?t=${update.timestamp}`);

                        // mock
                        location.reload();
                    }
                })
                break;
        }
    }
```

### 新建一个 `webSocket.js`，监听文件变化，通知浏览器

```js
    import chokidar from 'chokidar'
    import WebSocket from 'ws';
    import { posix } from 'path'

    // 暴露创建websocket方法
    // 建立一个 websocket 服务，封装 send 方法
    export function createWebSocketServer(server) {
        const wss = new WebSocket.Server({ noServer: true })

        server.on('upgrade', (req, socket, head) => {
            if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
                wss.handleUpgrade(req, socket, head, (ws) => {
                    wss.emit('connection', ws, req);
                });
            }
        });

        wss.on('connection', (socket) => {
            socket.send(JSON.stringify({ type: 'connected' }));
        });

        wss.on('error', (e) => {
            if (e.code !== 'EADDRINUSE') {
                console.error(
                    chalk.red(`WebSocket server error:\n${e.stack || e.message}`),
                );
            }
        });

        return {
            send(payload) {
                const stringified = JSON.stringify(payload);
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(stringified);
                    }
                });
            },

            close() {
                wss.close();
            },
        }
    }

    // 暴露监听文件变更方法
    export function watch(targetRootPath) {
        return chokidar.watch(targetRootPath, {
            ignored: ['**/node_modules/**', '**/.cache/**'],
            ignoreInitial: true,
            ignorePermissionErrors: true,
            disableGlobbing: true,
        })
    }

    function getShortName(file, root) {
        return file.startsWith(root + '/') ? posix.relative(root, file) : file;
    }

    // 暴露处理文件变化函数
    // 文件变化了执行的回调，里面其实就是用 websocket 推送变更数据
    export function handleHMRUpdate(opts) {
        const { file, ws } = opts;
        const shortFile = getShortName(file, opts.targetRootPath);
        const timestamp = Date.now();
        let updates
        if (shortFile.endsWith('.css') || shortFile.endsWith('.jsx')) {
            updates = [
                {
                    type: 'js-update',
                    timestamp,
                    path: `/${shortFile}`,
                    acceptedPath: `/${shortFile}`
                }
            ]
        }

        ws.send({
            type: 'update',
            updates
        })
    }
```

### `dev.js` 相应修改
```js
    // dev.js
    import { createWebSocketServer, watch, handleHMRUpdate} from './webSocket'
    // ...

    // 拦截请求根路径，返回index.html文件内容
    app.get('/', (req, res) => {

        // ...

        // 返回index.html文件的字符串
        html = html.replace('<head>', `<head>\n  <script type="module" src="/@vite/client"></script>`).trim()
        res.send(html);
    });

    // 把客户端代码以esm格式返回给浏览器
    app.get('/@vite/client', (req, res) => {
        res.set('Content-Type', 'application/javascript');
        res.send(
            // 这里返回的才是真正的内置的客户端代码
            transformCode({
                code: readFileSync(join(__dirname, 'client.js'), 'utf-8')
            }).code
        )
    });

    // ...

    const ws = createWebSocketServer(server);

    // 监听文件的变化
    watch(targetRootPath).on('change', async (file) => {
        handleHMRUpdate({ file, ws, targetRootPath });
    })

    const port = 9001;
    // 监听端口
    server.listen(port, () => {
        console.log('App is running at http://127.0.0.1:' + port)
    });
```
# 总结

至此，一个简单的 `vite` 开发版可以说是完成了。

## 简单梳理一下流程：

### 1、`vite` 基于 esm 机制

import 的内容都会走请求去拉取资源，我们自己起一个服务，就可以对这些请求的返回进行拦截处理，返回我们处理过后的内容

### 2、没有编译构建流程

整个应用就完全基于 node 服务，静态资源加载，没有编译构建的过程，肯定就会很快了。

### 3、热更新

基本原理就是：`修改代码 -> Node发现 xxx 文件变化了 -> 通知浏览器 xxx 文件改变了 -> 浏览器接受到消息 -> 浏览器重新请求 xxx 文件 -> 页面自动刷新`


## 完整项目路径

[`Github`](https://github.com/Char-set/vite-demo)
















