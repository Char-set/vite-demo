import express from "express";
import { createServer } from "http";
import { join, extname, dirname } from 'path'; // 文件路径相关操作api
import { readFileSync, existsSync } from "fs"; // 文件读取相关操作api
import { transformCss, transformJSX, transformCode } from './transform';
import { createWebSocketServer, watch, handleHMRUpdate} from './webSocket'

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
    })

    // 拦截 静态资源路径，并返回相应的 浏览器 可以识别的 资源
    app.get('/target/*', async (req, res) => {

        // req.path -----> /target/index.jsx
        // 完整的文件路径
        const filePath = join(__dirname, '..', req.path.slice(1));
        // 静态资源给一个 flag
        if ('import' in req.query) {
            res.set('Content-Type', 'application/javascript');
            res.send(`export default "${req.path}"`);
            return;
        }

        // 这里要区别不同文件的处理
        switch (extname(req.path)) {
            case '.js':
            case '.jsx': {
                res.set('Content-Type', 'application/javascript');
                // 这里封装一个 jsx 文件 转换为 js文件的方法，应为浏览器其实不能解析jsx文件的
                let { code } = await transformJSX({
                    appRoot: targetRootPath,
                    path: req.path,
                    code: readFileSync(filePath, 'utf-8')
                });
                res.send(code);
                break;
            }
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

    // 创建server服务器
    const server = createServer(app);
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
}

