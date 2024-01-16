const babylon = require('@babel/parser')
const traverse = require('@babel/traverse').default
const t = require('@babel/types')
const generate = require('@babel/generator').default

const names = 'Infinity,undefined,NaN,isFinite,isNaN,' +
  'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
  'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
  'require,global'

const hash = {}
names.split(',').forEach(function (name) {
  hash[name] = true
})

const dangerousKeys = 'length,size,prototype'
const dangerousKeyMap = {}
dangerousKeys.split(',').forEach((key) => {
  dangerousKeyMap[key] = true
})

// 判断 Identifier 是否需要处理
function checkBindThis (path) {
  return !(t.isDeclaration(path.parent) && path.parentKey === 'id') &&
    !(t.isFunction(path.parent) && path.listKey === 'params') &&
    !(t.isMethod(path.parent) && path.parentKey === 'key' && !path.parent.computed) &&
    !(t.isProperty(path.parent) && path.parentKey === 'key' && !path.parent.computed) &&
    !(t.isMemberExpression(path.parent) && path.parentKey === 'property' && !path.parent.computed) &&
    !t.isArrayPattern(path.parent) &&
    !t.isObjectPattern(path.parent) &&
    !hash[path.node.name]
}

// 计算访问路径
function calPropName (path) {
  let current = path.parentPath
  let last = path
  let keyPath = '' + path.node.name

  while (current.isMemberExpression() && last.parentKey !== 'property') {
    if (current.node.computed) {
      if (t.isLiteral(current.node.property)) {
        if (t.isStringLiteral(current.node.property)) {
          if (dangerousKeyMap[current.node.property.value]) {
            break
          }
          keyPath += `.${current.node.property.value}`
        } else {
          keyPath += `[${current.node.property.value}]`
        }
      } else {
        break
      }
    } else {
      if (dangerousKeyMap[current.node.property.name]) {
        break
      }
      keyPath += `.${current.node.property.name}`
    }
    last = current
    current = current.parentPath
  }

  return {
    last,
    keyPath
  }
}

function checkDelAndGetPath (path) {
  let current = path
  let delPath = path
  let canDel = true
  let ignore = false
  let replace = false

  // 确定删除路径
  while (!t.isBlockStatement(current)) {
    // case: !!a
    if (t.isUnaryExpression(current.parent) && current.key === 'argument') {
      delPath = current.parentPath
    } else if (t.isCallExpression(current.parent)) {
      const args = current.node.arguments || current.parent.arguments || []
      if (args.length === 1) { // case: String(a) || this._p(a)
        delPath = current.parentPath
      } else {
        break
      }
    } else if (t.isMemberExpression(current.parent)) { // case: String(a,'123').b.c
      if (current.parent.computed) { // case: a['b'] or a.b['c.d']
        if (t.isLiteral(current.parent.property)) {
          delPath = current.parentPath
        } else { // case: a[b]
          break
        }
      } else {
        delPath = current.parentPath
      }
    } else if (t.isLogicalExpression(current.container)) { // 只处理case: a || '' or '123' || a
      const key = current.key === 'left' ? 'right' : 'left'
      if (t.isLiteral(current.parent[key])) {
        delPath = current.parentPath
      } else {
        break
      }
    } else if (current.key === 'expression' && t.isExpressionStatement(current.parentPath)) { // dealRemove删除节点时需要
      delPath = current.parentPath
    } else {
      break
    }

    current = current.parentPath
  }

  // 确定是否可删除
  while (!t.isBlockStatement(current) && canDel) {
    const { key, listKey, container } = current

    if (t.isIfStatement(container) && key === 'test') {
      canDel = false
      break
    }

    if (listKey === 'arguments' && t.isCallExpression(current.parent)) {
      canDel = false
      break
    }

    if (container.computed) {
      if (key === 'property') {
        replace = true
      } else {
        canDel = false
        break
      }
    }

    if (t.isLogicalExpression(container)) { // case: a || ((b || c) && d)
      canDel = false
      ignore = true
      break
    }

    if (t.isConditionalExpression(container)) {
      if (key === 'test') {
        canDel = false
        break
      } else {
        ignore = true
        replace = true // 继续往上找，判断是否存在if条件等
      }
    }

    if (t.isBinaryExpression(container)) { // 运算 a + b
      replace = true // 不能break，case: if (a + b) {}
    }

    if (key === 'value' && t.isObjectProperty(container)) { // ({ name: a })
      replace = true
    }

    current = current.parentPath
  }

  return {
    delPath,
    canDel,
    ignore,
    replace
  }
}

// 判断前缀是否存在(只判断前缀，全等的情况，会返回false)
function checkPrefix (keys, key) {
  for (let i = 0; i < keys.length; i++) {
    const str = keys[i]
    if (key === str) continue
    // 确保判断当前标识是完整的单词
    if (key.startsWith(str) && (key[str.length] === '.' || key[str.length] === '[')) return true
  }
  return false
}

function dealRemove (path, replace) {
  try {
    if (replace) {
      path.replaceWith(t.stringLiteral(''))
    } else {
      if (path.inList) {
        t.validate(path.parent, path.key, [null])
      } else {
        t.validate(path.parent, path.key, null)
      }
      path.remove()
    }
    delete path.needBind
    delete path.collectInfo
  } catch (e) {}
}

module.exports = {
  transform (code, {
    needCollect = false,
    renderReduce = false,
    ignoreMap = {}
  } = {}) {
    const ast = babylon.parse(code, {
      plugins: [
        'objectRestSpread'
      ]
    })

    let currentBlock = null
    const bindingsMap = new Map()

    const propKeys = []
    let isProps = false

    const collectVisitor = {
      BlockStatement: {
        enter (path) { // 收集作用域下所有变量(keyPath)
          bindingsMap.set(path, {
            parent: currentBlock,
            bindings: {}
          })
          currentBlock = path
        },
        exit (path) {
          currentBlock = bindingsMap.get(path).parent
        }
      },
      Identifier (path) {
        if (
          checkBindThis(path) &&
          !ignoreMap[path.node.name]
        ) {
          const scopeBinding = path.scope.hasBinding(path.node.name)
          // 删除局部作用域的变量
          if (scopeBinding) {
            if (renderReduce) {
              const { delPath, canDel, replace } = checkDelAndGetPath(path)
              if (canDel) {
                delPath.delInfo = {
                  isLocal: true,
                  replace
                }
              }
            }
            return
          }
          const { last, keyPath } = calPropName(path)
          path.needBind = true
          if (needCollect) {
            last.collectInfo = {
              key: t.stringLiteral(keyPath),
              isSimple: !/[[.]/.test(keyPath)
            }
          }

          if (!renderReduce) return

          const { delPath, canDel, ignore, replace } = checkDelAndGetPath(path)

          if (canDel) {
            delPath.delInfo = {
              keyPath,
              replace
            }
          }

          if (ignore) return // ignore不计数，不需要被统计

          const { bindings } = bindingsMap.get(currentBlock)
          const target = bindings[keyPath] || []
          target.push({
            path: delPath,
            canDel
          })
          bindings[keyPath] = target
        }
      }
    }

    const bindThisVisitor = {
      BlockStatement: {
        enter (path) {
          const scope = bindingsMap.get(path)
          const parentScope = bindingsMap.get(scope.parent)
          scope.pBindings = parentScope ? Object.assign({}, parentScope.bindings, parentScope.pBindings) : {}
          currentBlock = path
        },
        exit (path) {
          currentBlock = bindingsMap.get(path).parent
        }
      },
      // 标记收集props数据
      CallExpression: {
        enter (path) {
          const callee = path.node.callee
          if (
            t.isMemberExpression(callee) &&
            t.isThisExpression(callee.object) &&
            (callee.property.name === '_p' || callee.property.value === '_p')
          ) {
            isProps = true
            path.isProps = true
          }
        },
        exit (path) {
          if (path.isProps) {
            // 移除无意义的__props调用
            const args = path.node.arguments[0]
            path.replaceWith(args)
            isProps = false
            delete path.isProps
          }
        }
      },
      // enter 先于特定标识执行
      enter (path) {
        // 删除重复变量
        if (path.delInfo) {
          const { keyPath, isLocal, replace } = path.delInfo
          delete path.delInfo

          if (isLocal) { // 局部作用域里的变量，可直接删除
            dealRemove(path, replace)
            return
          }
          const data = bindingsMap.get(currentBlock)
          const { bindings, pBindings } = data
          const allBindings = Object.assign({}, pBindings, bindings)

          // 优先判断前缀，再判断全等
          if (checkPrefix(Object.keys(allBindings), keyPath) || pBindings[keyPath]) {
            dealRemove(path, replace)
          } else {
            const currentBlockVars = bindings[keyPath] || [] // 对于只出现一次的可忽略变量，需要兜底
            if (currentBlockVars.length >= 1) {
              const index = currentBlockVars.findIndex(item => !item.canDel)
              if (index !== -1 || currentBlockVars[0].path !== path) { // 当前block中存在不可删除的变量 || 不是第一个可删除变量，即可删除该变量
                dealRemove(path, replace)
              }
            }
          }
        }

        // bind this 将 a 转换成 this.a
        if (path.needBind) {
          const name = path.node.name
          if (name) { // 确保path没有被删除 且 没有被替换成字符串
            if (isProps) {
              propKeys.push(name)
            }
            path.replaceWith(t.memberExpression(t.thisExpression(), path.node))
          }
          delete path.needBind
        }
      },
      MemberExpression: {
        exit (path) {
          if (path.collectInfo) {
            const { isSimple, key } = path.collectInfo
            const callee = isSimple ? t.identifier('_sc') : t.identifier('_c')
            const replaceNode = renderReduce
              ? t.callExpression(callee, [key])
              : t.callExpression(callee, [key, path.node])
            path.node && path.replaceWith(replaceNode)
            delete path.collectInfo
          }
        }
      }
    }

    traverse(ast, collectVisitor)
    traverse(ast, bindThisVisitor)

    return {
      code: generate(ast).code,
      propKeys
    }
  }
}
