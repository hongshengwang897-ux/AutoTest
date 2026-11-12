// 演示用本地 mock 接口：返回固定 JSON，供「响应提取」功能演示
// 运行：node mock-server.mjs   （监听 http://127.0.0.1:9300）
import { createServer } from "node:http";

const PORT = 9300;
const HOST = "127.0.0.1";

const payload = {
  code: 0,
  message: "ok",
  data: {
    token: "demo-token-abc123",
    userId: 42,
    user: { id: 7, name: "张三", roles: ["admin", "tester"] },
    items: [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ],
  },
};

createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}).listen(PORT, HOST, () => {
  console.log(`演示 mock 服务已启动: http://${HOST}:${PORT} （任意路径均返回同一 JSON）`);
});
