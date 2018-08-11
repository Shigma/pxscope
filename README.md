# Pxscope

一个 Pixiv 的桌面版。

## 项目说明

文件目录：
```
assets 存放字体，图标等资源
build 存放构建和打包的代码
comp 存放页面组件的源代码
dist 存放构建后的页面组件
i18n 存放多语言配置
logs 存放错误日志
pack 存放打包后的文件
pixiv 存放 API 接口
themes 存放多主题配置

main.js 主进程入口
index.js 渲染进程入口
```

## 本地构建

1. clone 这个项目。
2. `npm install`更新依赖。
3. `npm run start`开始运行。

### 技术栈

- build: 执行资源文件的生成工作
- transpile: 每次 dev 状态下运行
- bundle: 使用 webpack 打包和压缩
- pack: 使用 electron-packager 打包
