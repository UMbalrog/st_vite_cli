#! /usr/bin/env node
const Koa = require('koa')
const send = require('koa-send')
const path =require('path')

const app = new Koa()

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => {
      // 结束之后利用buffer合并再转为字符串
      resolve(Buffer.concat(chunks).toString('utf-8'))
    })
    stream.on('error', reject)
  })
}
// app.use()开启中间件
// 3.加载第三方模块
app.use(async (ctx, next) => { //这里是处理静态文件之前，所以要放在服务之前
  // ctx.path --> /@modules/
  if(ctx.path.startsWith('/@modules/')){
    let moduleName = ctx.path.substr(10);
    let pkgpath = path.join(process.cwd(), 'node_modules', moduleName, 'package.json')
    let pkg = require(pkgpath);
    ctx.path = path.join('node_modules', moduleName, pkg.module)
  }
  await next()
})

// 1.创建一个静态服务
app.use(async (ctx, next) => {
  await send(ctx, ctx.path, {root: process.cwd(), index: 'index.html'})
  await next()
})
// 2.修改第三方模块路劲
app.use(async (ctx, next) => {
  if(ctx.type === 'application/javascript'){
    let contents = await streamToString(ctx.body)
    // import Vue from 'vue';  匹配此路径
    // import App from './App.vue'; 不匹配./ 因为可以访问到 正则?!不匹配的次正则
    ctx.body = contents.replace(/(from\s+['"])(?!\.\/)/g, '$1/@modules/');
  }
  
  await next()
})


app.listen(3001)
console.log('Server running localhost:3001')