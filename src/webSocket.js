import chokidar from 'chokidar'
import WebSocket from 'ws';
import { posix } from 'path'

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

// 监听文件变更
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