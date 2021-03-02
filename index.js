#! /usr/bin/env node
const Koa = require('koa')
const send = require('koa-send')
const path = require('path')
const compilerSfc = require('@vue/compiler-sfc')
const { Readable } = require('stream')

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

function stringToStream(text) {
  const stream = new Readable()
  stream.push(text)
  stream.push(null) //结束要添加一个null
  return stream
}
// app.use()开启中间件
// 3.加载第三方模块
// 这里是处理静态文件之前，所以要放在服务之前
app.use(async (ctx, next) => { 
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
// 4.处理单文件组件，要在静态资源加载完后，处理第三个模块前，因为单文件组件内也有可能加载第三方组件
app.use(async (ctx, next) => {
  if(ctx.path.endsWith('.vue')){
    const contents = await streamToString(ctx.body)
    const { descriptor } = compilerSfc.parse(contents)
    let code
    if(!ctx.query.type){
      code = descriptor.script.content
      
      code = code.replace(/export\s+default\s+/g, 'const __script = ')
      code += `
import { render as __render } from "${ctx.path}?type=template"
__script.render = __render
export default __script
      `
    }else if(ctx.query.type === 'template'){
      const templateRender = compilerSfc.compileTemplate({ source: descriptor.template.content})
      code = templateRender.code
    }
    ctx.type = 'application/javascript'
    ctx.body = stringToStream(code)
  }
  await next()
})

// 2.修改第三方模块路劲
app.use(async (ctx, next) => {
  if(ctx.type === 'application/javascript'){
    let contents = await streamToString(ctx.body)
    // import Vue from 'vue';  匹配此路径
    // import App from './App.vue'; 不匹配./ 因为可以访问到 正则?!不匹配的次正则
    ctx.body = contents
      .replace(/(from\s+['"])(?![\.\/])/g, '$1/@modules/')
      .replace(/process\.env\.NODE_ENV/g, '"development"') //替换node中的环境变量
  }
  
  await next()
})


app.listen(3001)
console.log('Server running localhost:3001')