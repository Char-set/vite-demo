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