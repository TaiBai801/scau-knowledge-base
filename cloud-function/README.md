# CloudBase 云函数部署指南

## 1. 安装 CloudBase CLI

```bash
npm i -g @cloudbase/cli
cloudbase login
```

## 2. 创建云函数

```bash
cd D:\培养方案拓展\cloud-function
cloudbase functions:deploy save-course --env 你的环境ID --dir .
```

## 3. 设置环境变量

在 CloudBase 控制台 → 云函数 → save-course → 环境变量:

```
GITHUB_TOKEN = ghp_xxxxxxxxxxxxxxxxxxxx
```

## 4. 获取 API 地址

部署完成后 CloudBase 会返回一个 URL，类似:
`https://xxx.apigw.tencentcs.com/release/save-course`

## 5. 更新 admin/edit.html

把 `API_URL` 改为上一步的地址:

```js
const API_URL = 'https://xxx.apigw.tencentcs.com/release/save-course';
```

## 6. 测试

1. 打开 `/admin/index.html` → 选一门课 → 编辑
2. 修改内容 → 点「💾 保存并发布」
3. 1-2分钟后刷新站点验证
